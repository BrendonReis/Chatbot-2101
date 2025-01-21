import { Request, Response } from "express";
import AppError from "../errors/AppError";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Queue from "../models/Queue";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import formatBody from "../helpers/Mustache";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
  number?: string;
  closeTicket?: true;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;
  const { companyId, profile } = req.user;
  const queues: number[] = [];

  if (profile !== "admin") {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Queue, as: "queues" }]
    });
    user.queues.forEach(queue => {
      queues.push(queue.id);
    });
  }

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId,
    companyId,
    queues
  });

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];
  const { companyId } = req.user;

  const ticket = await ShowTicketService(ticketId, companyId);

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File, index) => {
        await SendWhatsAppMedia({ media, ticket, body: Array.isArray(body) ? body[index] : body });
      })
    );
  } else {
    const send = await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;

  const message = await DeleteWhatsAppMessage(messageId);

  const io = getIO();
  io.to(message.ticketId.toString()).emit(`company-${companyId}-appMessage`, {
    action: "update",
    message
  });

  return res.send();
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params as unknown as { whatsappId: number };
  const messageData: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  console.log("Início do envio de mensagem...");
  console.log("whatsappId:", whatsappId);
  console.log("Dados da mensagem:", messageData);
  
  try {
    console.log("Buscando WhatsApp com id:", whatsappId);
    const whatsapp = await Whatsapp.findByPk(whatsappId);

    if (!whatsapp) {
      console.log("WhatsApp não encontrado com esse id.");
      throw new Error("Não foi possível realizar a operação");
    }

    console.log("WhatsApp encontrado:", whatsapp);

    if (messageData.number === undefined) {
      console.log("Número de telefone não fornecido.");
      throw new Error("O número é obrigatório");
    }

    const numberToTest = messageData.number;
    const body = messageData.body;

    console.log("Número a ser validado:", numberToTest);
    const companyId = whatsapp.companyId;

    console.log("Verificando número de contato...");
    const CheckValidNumber = await CheckContactNumber(numberToTest, companyId);
    console.log("Número validado:", CheckValidNumber);

    const number = CheckValidNumber.jid.replace(/\D/g, "");
    console.log("Número sem caracteres não numéricos:", number);

    console.log("Obtendo a URL da foto do perfil...");
    const profilePicUrl = await GetProfilePicUrl(number, companyId);
    console.log("URL da foto do perfil:", profilePicUrl);

    const contactData = {
      name: `${number}`,
      number,
      profilePicUrl,
      isGroup: false,
      companyId
    };

    console.log("Criando ou atualizando o contato...");
    const contact = await CreateOrUpdateContactService(contactData);
    console.log("Contato criado ou atualizado:", contact);

    console.log("Buscando ou criando ticket...");
    const ticket = await FindOrCreateTicketService(contact, whatsapp.id!, 0, companyId);
    console.log("Ticket encontrado ou criado:", ticket);

    if (medias) {
      console.log("Mídias encontradas, adicionando na fila...");
      await Promise.all(
        medias.map(async (media: Express.Multer.File) => {
          console.log("Enviando mídia:", media.originalname);
          await req.app.get("queues").messageQueue.add(
            "SendMessage",
            {
              whatsappId,
              data: {
                number,
                body: body ? formatBody(body, contact) : media.originalname,
                mediaPath: media.path,
                fileName: media.originalname
              }
            },
            { removeOnComplete: true, attempts: 3 }
          );
        })
      );
    } else {
      console.log("Enviando mensagem sem mídia...");
      await SendWhatsAppMessage({ body: formatBody(body, contact), ticket });

      await ticket.update({
        lastMessage: body,
      });

      console.log("Mensagem enviada e ticket atualizado.");
    }

    if (messageData.closeTicket) {
      console.log("Fechando ticket...");
      setTimeout(async () => {
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" },
          companyId
        });
        console.log("Ticket fechado.");
      }, 1000);
    }

    console.log("Marcando mensagens como lidas...");
    SetTicketMessagesAsRead(ticket);

    console.log("Mensagem enviada com sucesso.");
    return res.send({ mensagem: "Mensagem enviada" });
  } catch (err: any) {
    console.log("Erro durante o envio da mensagem:", err);
    if (Object.keys(err).length === 0) {
      throw new AppError(
        "Não foi possível enviar a mensagem, tente novamente em alguns instantes"
      );
    } else {
      throw new AppError(err.message);
    }
  }
};


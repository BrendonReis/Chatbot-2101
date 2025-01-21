import { Request, Response } from "express";
import ImportContactsService from "../services/WbotServices/ImportContactsService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  
  try {
    const contactsFromFile = req.body.contacts; 
    const contactsFromWhatsapp = !contactsFromFile; 

    if (contactsFromWhatsapp) {
      await ImportContactsService(companyId);
      return res.status(200).json({ message: "Contacts imported from WhatsApp" });
    }

    if (!contactsFromFile || contactsFromFile.length === 0) {
      return res.status(400).json({ error: "No contacts provided" });
    }

    await ImportContactsService(companyId, contactsFromFile);

    return res.status(200).json({ message: "Contacts imported from file" });

  } catch (error) {
    console.error('Error in contacts import route:', error);
    return res.status(500).json({ message: "Internal Server Error", error });
  }
};

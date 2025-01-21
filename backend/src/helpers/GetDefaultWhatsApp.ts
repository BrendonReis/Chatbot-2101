import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import GetDefaultWhatsAppByUser from "./GetDefaultWhatsAppByUser";

const GetDefaultWhatsApp = async (
  companyId: number,
  userId?: number
): Promise<Whatsapp> => {
  let connection: Whatsapp;

  console.log(`[INFO] Starting GetDefaultWhatsApp for companyId: ${companyId}, userId: ${userId}`);

  const defaultWhatsapp = await Whatsapp.findOne({
    where: { isDefault: true, companyId }
  });
  console.log(`[DEBUG] Default WhatsApp:`, defaultWhatsapp);

  if (defaultWhatsapp?.status === 'CONNECTED') {
    console.log(`[INFO] Default WhatsApp is connected.`);
    connection = defaultWhatsapp;
  } else {
    const whatsapp = await Whatsapp.findOne({
      where: { status: "CONNECTED", companyId }
    });
    console.log(`[DEBUG] Fallback WhatsApp (without userId):`, whatsapp);
    connection = whatsapp;
  }

  if (userId) {
    console.log(`[INFO] Searching for WhatsApp connection by userId: ${userId}`);
    const whatsappByUser = await GetDefaultWhatsAppByUser(userId);
    console.log(`[DEBUG] WhatsApp by User:`, whatsappByUser);

    if (whatsappByUser?.status === 'CONNECTED') {
      console.log(`[INFO] User-specific WhatsApp is connected.`);
      connection = whatsappByUser;
    } else {
      console.log(`[WARN] No connected WhatsApp found for userId: ${userId}, trying fallback.`);
      const whatsapp = await Whatsapp.findOne({
        where: { status: "CONNECTED", companyId }
      });
      console.log(`[DEBUG] Fallback WhatsApp (with userId):`, whatsapp);
      connection = whatsapp;
    }
  }

  if (!connection) {
    console.error(`[ERROR] No default WhatsApp found for companyId: ${companyId}`);
    throw new AppError(`ERR_NO_DEF_WAPP_FOUND in COMPANY ${companyId}`);
  }

  console.log(`[SUCCESS] Returning connected WhatsApp:`, connection);
  return connection;
};

export default GetDefaultWhatsApp;
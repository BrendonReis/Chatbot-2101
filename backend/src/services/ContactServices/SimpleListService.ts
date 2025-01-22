import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";
import { FindOptions, Op } from "sequelize";

export interface SearchContactParams {
  companyId: string | number;
  name?: string;
  startDate?: string;
  endDate?: string;
}

const SimpleListService = async ({ name, companyId, startDate, endDate }: SearchContactParams): Promise<Contact[]> => {
  const whereClause: any = {
    companyId
  };

  if (name) {
    whereClause.name = {
      [Op.like]: `%${name}%`
    };
  }

  if (startDate && endDate) {
    whereClause.createdAt = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const options: FindOptions = {
    where: whereClause,
    order: [['name', 'ASC']],
  };

  const contacts = await Contact.findAll(options);

  if (!contacts) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  return contacts;
};

export default SimpleListService;

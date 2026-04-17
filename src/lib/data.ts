import { Company } from './types';
import rawData from '../../public/full_data.json';

let _companies: Company[] | null = null;

export function getCompanies(): Company[] {
  if (!_companies) {
    _companies = (rawData as { companies: Company[] }).companies;
  }
  return _companies;
}

export function getCompany(id: string): Company | undefined {
  return getCompanies().find(c => c.id === id);
}

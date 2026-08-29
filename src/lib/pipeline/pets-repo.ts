/** pets-repo stub — original deleted with api/ops route */
export type PetRow = {
  id: string;
  species_id: string;
  nickname: string;
  created_at: string;
  status: string;
  published_preview: string;
  name?: { zh: string; en: string };
  series_id?: string;
  stage?: number;
};

export async function listPets(): Promise<PetRow[]> {
  return [];
}

export async function listPublishedPets(): Promise<PetRow[]> {
  return [];
}

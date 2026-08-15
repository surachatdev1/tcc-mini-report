import directory from "./schools.generated.json";

export type SchoolDirectoryEntry = {
  id: string;
  name: string;
  district: string;
  source: "obec" | "private";
};

type SchoolDirectoryPayload = {
  metadata: {
    generatedOn: string;
    scope: string;
    total: number;
    countsByProvince: Record<string, number>;
  };
  schoolsByProvince: Record<string, SchoolDirectoryEntry[]>;
};

const payload = directory as SchoolDirectoryPayload;

export const schoolDirectoryMetadata = payload.metadata;

export function getSchoolsByProvince(province: string) {
  return payload.schoolsByProvince[province] ?? [];
}

export function normalizeSchoolSearch(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("th");
}

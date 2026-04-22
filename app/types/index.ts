// Exporta todos los tipos del dominio desde aquí
export type { User } from "@prisma/client";

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

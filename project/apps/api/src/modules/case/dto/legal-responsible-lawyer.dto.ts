import { IsNotEmpty, IsOptional, IsString } from "class-validator";

// WP-1d-5-4: Hukuki Sorumlu Avukat (CaseLawyer.isResponsible) kontrollü değişiklik gövdesi.
// Sözleşme: docs/wp1d5-legal-responsible-lawyer-change-endpoint-audit-contract.md
// "Hukuki sorumlu avukat devredilmez; hukuki sorumlu avukat kaydı kurallı şekilde değiştirilir."
// reason ZORUNLU; effectiveAt/asOf/backdate YOK (etkin zaman = server-side audit timestamp).
export class ChangeLegalResponsibleLawyerDto {
  @IsString()
  @IsNotEmpty()
  lawyerId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

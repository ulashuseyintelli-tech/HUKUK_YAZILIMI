import { IsString, IsNotEmpty } from "class-validator";

/**
 * ReportingLine Population Core (CAP-02 object-scope enablement).
 * Manager–personel raporlama ilişkisi User→User anahtarlıdır; StaffMember/Lawyer
 * profilleri yalnız kimlik çözümü, gösterim ve uygunluk doğrulaması içindir.
 */

export class AssignManagerDto {
  @IsString()
  @IsNotEmpty()
  actorUserId: string;

  @IsString()
  @IsNotEmpty()
  managerUserId: string;
}

export class ActorRefDto {
  @IsString()
  @IsNotEmpty()
  actorUserId: string;
}

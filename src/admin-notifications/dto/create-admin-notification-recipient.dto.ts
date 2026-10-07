import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAdminNotificationRecipientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;
}

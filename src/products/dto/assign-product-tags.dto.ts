import { IsArray, IsUUID } from 'class-validator';
export class AssignProductTagsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds: string[];
}

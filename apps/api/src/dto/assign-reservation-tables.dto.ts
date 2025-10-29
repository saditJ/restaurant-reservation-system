import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

export class AssignReservationTablesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  tableIds!: string[];
}

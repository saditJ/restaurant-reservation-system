import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class AssignReservationTablesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tableIds!: string[];
}

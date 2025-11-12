import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { FloorplanService } from './floorplan.service';
import { UpdateFloorplanDto } from './dto/update-floorplan.dto';

type TenantAwareRequest = Request & { tenantId?: string };

@Controller('v1/venues/:venueId/floorplan')
export class FloorplanController {
  constructor(private readonly floorplan: FloorplanService) {}

  @Roles('owner', 'manager')
  @Get()
  getFloorplan(
    @Param('venueId') venueId: string,
    @Req() req: TenantAwareRequest,
  ) {
    return this.floorplan.getFloorplan(venueId, req.tenantId);
  }

  @Roles('owner', 'manager')
  @Put()
  updateFloorplan(
    @Param('venueId') venueId: string,
    @Body() body: UpdateFloorplanDto,
    @Req() req: TenantAwareRequest,
  ) {
    return this.floorplan.updateFloorplan(venueId, req.tenantId, body);
  }

  @Roles('owner', 'manager')
  @Get('occupancy')
  getOccupancy(
    @Param('venueId') venueId: string,
    @Query('at') at: string | undefined,
    @Req() req: TenantAwareRequest,
  ) {
    const instant = this.parseInstant(at);
    return this.floorplan.getOccupancySnapshot(venueId, instant, req.tenantId);
  }

  private parseInstant(value?: string) {
    if (!value) {
      return new Date();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid at parameter');
    }
    return parsed;
  }
}

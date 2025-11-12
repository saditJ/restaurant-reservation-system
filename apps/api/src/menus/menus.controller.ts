import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { MenusService, PublicMenuResponse } from './menus.service';

@Controller('v1/menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Public()
  @RateLimit({ requestsPerMinute: 180, burstLimit: 90 })
  @Get(':venueId/public')
  async getPublicMenu(
    @Param('venueId') venueId: string,
  ): Promise<PublicMenuResponse> {
    return this.menus.getPublicMenu(venueId);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantThemeDto } from './dto/update-tenant-theme.dto';

type TenantAwareRequest = Request & { tenantId?: string };

@Controller('v1/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Public()
  @Get(':tenantId/theme')
  async getTheme(
    @Param('tenantId') tenantParam: string,
    @Req() req: TenantAwareRequest,
  ) {
    const tenantId = resolveTenantParam(tenantParam, req, {
      allowPublic: true,
    });
    return this.tenants.getTheme(tenantId);
  }

  @Roles('owner', 'manager')
  @Put(':tenantId/theme')
  async updateTheme(
    @Param('tenantId') tenantParam: string,
    @Body() body: UpdateTenantThemeDto,
    @Req() req: TenantAwareRequest,
  ) {
    const tenantId = resolveTenantParam(tenantParam, req, {
      allowPublic: false,
    });
    if (req.tenantId && req.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Tenant context does not match request path',
      );
    }
    return this.tenants.updateTheme(tenantId, body);
  }
}

const SELF_ALIASES = new Set(['self', 'current', 'me', 'host']);

function resolveTenantParam(
  param: string,
  req: TenantAwareRequest,
  options: { allowPublic: boolean },
): string {
  const trimmed = (param ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException('tenantId parameter is required');
  }
  if (SELF_ALIASES.has(trimmed.toLowerCase())) {
    if (!req.tenantId) {
      throw new BadRequestException(
        'Tenant context is required for this request',
      );
    }
    return req.tenantId;
  }
  if (!options.allowPublic && !req.tenantId) {
    throw new BadRequestException('Tenant context missing from request');
  }
  return trimmed;
}

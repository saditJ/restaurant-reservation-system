import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { MarketService } from './market.service';
import { VenueSearchDto, VenueListResponseDto } from './dto/venue-list.dto';
import { VenueDetailDto } from './dto/venue-detail.dto';
import { SearchSuggestDto, SearchSuggestResponseDto } from './dto/search.dto';
import { VenueFacetsDto, VenueFacetResponseDto } from './dto/venue-facets.dto';

@Controller('v1/market')
@Public()
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('venues')
  async searchVenues(
    @Query() dto: VenueSearchDto,
  ): Promise<VenueListResponseDto> {
    return this.marketService.searchVenues(dto);
  }

  @Get('venues/facets')
  async getVenueFacets(
    @Query() dto: VenueFacetsDto,
  ): Promise<VenueFacetResponseDto> {
    return this.marketService.getVenueFacets(dto);
  }

  @Get('venues/:slug')
  async getVenueBySlug(@Param('slug') slug: string): Promise<VenueDetailDto> {
    return this.marketService.getVenueBySlug(slug);
  }

  @Get('search/suggest')
  async searchSuggestions(
    @Query() dto: SearchSuggestDto,
  ): Promise<SearchSuggestResponseDto> {
    return this.marketService.searchSuggestions(dto.q, dto.limit);
  }
}

import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SearchService } from './search.service';

class AiSearchDto {
  @IsString()
  @MinLength(3, { message: 'השאילתה קצרה מדי (מינימום 3 תווים)' })
  @MaxLength(500)
  query!: string;
}

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('api/ai/status')
  status() {
    return {
      engine: 'local',
      cost: 'free',
      hint: 'חיפוש חכם מקומי בעברית — ללא OpenAI וללא עלות',
    };
  }

  @Post('api/ai/search')
  @HttpCode(200)
  async aiSearch(@Body() body: AiSearchDto) {
    return this.search.runAiSearch(body.query.trim());
  }
}

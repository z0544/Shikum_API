import { Body, Controller, DefaultValuePipe, Get, HttpCode, Post, Query } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ChatContext, SearchService } from './search.service';

class AiSearchDto {
  @IsString()
  @MinLength(3, { message: 'השאילתה קצרה מדי (מינימום 3 תווים)' })
  @MaxLength(500)
  query!: string;
}

class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsObject()
  context?: ChatContext;
}

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('api/ai/status')
  status() {
    const aiEnabled = this.search.isAiEnabled();
    return {
      engine: aiEnabled ? 'gemini' : 'local',
      ai_enabled: aiEnabled,
      cost: aiEnabled ? 'gemini-api' : 'free',
      hint: aiEnabled
        ? 'עוזר חכם מבוסס Gemini — תשובות מעוגנות בנתוני המערכת (RAG)'
        : 'חיפוש חכם מקומי בעברית — ללא AI וללא עלות',
    };
  }

  @Post('api/ai/search')
  @HttpCode(200)
  async aiSearch(@Body() body: AiSearchDto) {
    return this.search.runAiSearch(body.query.trim());
  }

  @Post('api/ai/chat')
  @HttpCode(200)
  async chat(@Body() body: ChatDto) {
    return this.search.chat(body.message.trim(), body.context || {});
  }

  @Get('api/ai/suggest')
  async suggest(@Query('q', new DefaultValuePipe('')) q: string) {
    return { suggestions: await this.search.suggest(q) };
  }
}

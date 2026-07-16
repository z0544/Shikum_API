import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ChatContext, SearchService } from './search.service';

const DOC_ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

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

  /** ניתוח מסמך הפניה שצורף (PDF/תמונה) — Gemini מזהה את השירות הנדרש ומחפש. */
  @Post('api/ai/chat/document')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async chatDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('context') contextRaw?: string,
  ) {
    if (!file) throw new BadRequestException('לא צורף קובץ');
    if (!DOC_ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('פורמט לא נתמך — צרף PDF או תמונה (PNG/JPG).');
    }
    let context: ChatContext = {};
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw);
      } catch {
        /* מתעלמים מהקשר לא תקין */
      }
    }
    return this.search.chatFromDocument(file, context);
  }

  @Get('api/ai/suggest')
  async suggest(@Query('q', new DefaultValuePipe('')) q: string) {
    return { suggestions: await this.search.suggest(q) };
  }
}

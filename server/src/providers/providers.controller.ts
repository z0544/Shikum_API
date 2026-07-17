import { Controller, Post } from '@nestjs/common';
import { ProviderDirectoryService } from './provider-directory.service';

/** טריגר לרענון ספריית הספקים (נועד לתזמון שבועי חיצוני או הפעלה ידנית). */
@Controller('api/providers')
export class ProvidersController {
  constructor(private readonly providers: ProviderDirectoryService) {}

  @Post('sync')
  async sync() {
    return this.providers.sync();
  }
}

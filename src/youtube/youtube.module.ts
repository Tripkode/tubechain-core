import { Module } from '@nestjs/common';
import { YoutubeService } from './youtube.service';
import { YoutubeController } from './youtube.controller';
import { YoutubeDownloadService } from './services/download.service';
import { YoutubeHealthService } from './services/health.service';
import { VideoUrlService } from './services/url.service';
import { VideoInfoService } from './services/info.service';
import { VideoFormatService } from './services/video-format.service';
import { YtDlpCommandService } from './services/yt-dlp.service';
import { FileUtilityService } from './services/utility.service';

@Module({
  controllers: [YoutubeController],
  providers: [
    YoutubeDownloadService,
    YoutubeHealthService,
    VideoUrlService,
    VideoInfoService,
    VideoFormatService,
    YtDlpCommandService,
    FileUtilityService,
    YoutubeService
  ],
})
export class YoutubeModule { }

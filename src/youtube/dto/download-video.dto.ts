import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, Matches } from 'class-validator';

export class DownloadVideoDto {
  @ApiProperty({
    description: 'URL del video de YouTube para descargar',
    example: 'https://youtu.be/iSunMBID7jw?si=Es6S3GiNVFC5Igbc',
    pattern: '^https://(www\.)?(youtube\.com|youtu\.be)/.+',
  })
  @IsString()
  @IsUrl()
  @Matches(
    /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    {
      message: 'La URL debe ser un enlace válido de YouTube',
    },
  )
  url: string;
}
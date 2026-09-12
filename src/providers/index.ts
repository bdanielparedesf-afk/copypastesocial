import { AuditResult } from '@/types';

export abstract class BaseProvider {
  abstract readonly id: 'instagram' | 'youtube' | 'facebook' | 'tiktok';
  abstract readonly label: string;

  abstract canHandle(hostname: string): boolean;
  abstract audit(url: string): Promise<AuditResult>;
  abstract fetchContent(url: string): Promise<unknown>;
}

export type ProviderId = BaseProvider['id'];
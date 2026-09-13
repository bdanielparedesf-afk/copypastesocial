import { createClient } from '@/lib/supabase/server';

export async function isDuplicate(media_id: string, account_id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('publication_jobs')
    .select('id')
    .eq('media_id', media_id)
    .eq('social_account_id', account_id)
    .in('status', ['pending', 'processing', 'uploading', 'publishing', 'success'])
    .limit(1);

  return (data?.length ?? 0) > 0;
}

import { getChaoxingLoginOptions } from '@/lib/chaoxing-client';
import { getChaoxingFormConfigurationStatus } from '@/lib/chaoxing-sync';

export type IntegrationState = 'ready' | 'fixture' | 'pending' | 'configured' | 'error';

export interface IntegrationStatusItem {
  state: IntegrationState;
  label: string;
  detail: string;
}

export interface IntegrationStatus {
  supabase: IntegrationStatusItem;
  coze: IntegrationStatusItem;
  chaoxingAuth: IntegrationStatusItem;
  chaoxingForm: IntegrationStatusItem;
}

function hasValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function getIntegrationStatus(): IntegrationStatus {
  const authConfigured = process.env.ENABLE_CHAOXING_AUTH === 'true'
    && getChaoxingLoginOptions().configured;
  const fixture = process.env.ENABLE_AI_FIXTURE === 'true';
  const cozeManaged = hasValue('COZE_PROJECT_ENV') || hasValue('COZE_PROJECT_DOMAIN_DEFAULT');
  const supabaseReady = hasValue('COZE_SUPABASE_URL')
    && hasValue('COZE_SUPABASE_ANON_KEY')
    && hasValue('COZE_SUPABASE_SERVICE_ROLE_KEY');
  const formStatus = getChaoxingFormConfigurationStatus();

  return {
    supabase: supabaseReady
      ? { state: 'ready', label: 'Supabase', detail: '数据库配置已注入' }
      : { state: 'pending', label: 'Supabase', detail: '待配置数据库连接' },
    coze: fixture
      ? { state: 'fixture', label: 'Coze 智能体', detail: '当前使用本地评阅夹具' }
      : cozeManaged
        ? { state: 'ready', label: 'Coze 智能体', detail: '由 Coze 运行环境托管' }
        : { state: 'pending', label: 'Coze 智能体', detail: '待在 Coze 环境验证' },
    chaoxingAuth: authConfigured
      ? { state: 'ready', label: '学习通身份', detail: 'OAuth 已启用' }
      : { state: 'pending', label: '学习通身份', detail: '待校方 OAuth 参数联调' },
    chaoxingForm: {
      state: formStatus.state,
      label: '超星表单',
      detail: formStatus.detail,
    },
  };
}

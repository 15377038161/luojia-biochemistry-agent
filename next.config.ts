import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // 限制生产构建的静态页面数据收集 worker 数量。
    // Next.js 默认取 os.cpus().length - 1（64 核环境为 63 个并行 worker），
    // 在内存受限的部署环境中会触发 OOM，导致 next build 被 SIGKILL。
    cpus: 2,
  },
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ['127.0.0.1', 'localhost', '*.dev.coze.site'],
  images: {
    // Coze 生产运行目录不提供可写的 .next/cache/images，避免图片优化器
    // 在每次请求时尝试创建缓存目录并持续产生 ENOENT 错误。
    unoptimized: true,
    // 不要放开为 hostname: '*'：那会把 /_next/image 变成任意主机的开放图片代理
    // （带宽滥用 + 对内网可解析主机的 SSRF 面）。新增外部图源请逐个显式登记。
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'photo.chaoxing.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

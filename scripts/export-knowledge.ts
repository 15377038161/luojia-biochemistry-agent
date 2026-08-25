import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { experimentSteps } from '../src/domain/experiment';
import { courseImageQuestions } from '../src/domain/media';

const root = process.cwd();
const output = path.join(root, 'knowledge-base', 'structured');

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function main() {
  await mkdir(output, { recursive: true });
  const generatedAt = new Date().toISOString();

  await writeFile(
    path.join(output, 'experiment-steps.json'),
    JSON.stringify({ schemaVersion: '1.0.0', generatedAt, steps: experimentSteps }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(output, 'image-questions.json'),
    JSON.stringify({ schemaVersion: '1.0.0', generatedAt, questions: courseImageQuestions }, null, 2),
    'utf8',
  );

  const sourceFiles = [
    '01_课程范围与规则.docx',
    '03_八步SOP.docx',
    '04_评分与题库.docx',
    '05_序列与载体.docx',
    '06_试剂与仪器.docx',
  ];
  const sourceDir = path.join(root, 'knowledge-base', 'raw-teacher-materials', '提交的资料');
  const sources = [];
  for (const name of sourceFiles) {
    const filePath = path.join(sourceDir, name);
    sources.push({ name, relativePath: path.relative(root, filePath).replaceAll('\\', '/'), sha256: await sha256(filePath) });
  }
  await writeFile(
    path.join(output, 'authoritative-sources.json'),
    JSON.stringify({ schemaVersion: '1.0.0', generatedAt, sources }, null, 2),
    'utf8',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

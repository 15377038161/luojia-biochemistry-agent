import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTeacherSessionScope } from '@/lib/services/teacher-scope';
import { createFakeSupabase, tableCalls } from './helpers/fake-supabase';

for (const teacher of ['teacher-a', 'teacher-b']) {
  test(teacher + ' 查询必须携带自身授权班级及正式学生角色', async () => {
    const { client, calls, pushResponse } = createFakeSupabase();
    const classId = teacher === 'teacher-a' ? 'class-a' : 'class-b';
    pushResponse([{ class_id: classId }]);
    pushResponse({ id: 'owned', user_id: 'student', class_id: classId, agent_role: 'student' });
    const result = await requireTeacherSessionScope(client as never, teacher, 'owned');
    assert.equal(result.id, 'owned');
    assert.ok(tableCalls(calls, 'enrollments')[0].filters.some(f => f.column === 'user_id' && f.value === teacher));
    const filters = tableCalls(calls, 'agent_sessions')[0].filters;
    assert.ok(filters.some(f => f.column === 'class_id' && JSON.stringify(f.value) === JSON.stringify([classId])));
    assert.ok(filters.some(f => f.column === 'agent_role' && f.value === 'student'));
  });
}
test('猜测其他班级的会话被拒绝，未授权教师不查询学生表', async () => {
  const cross = createFakeSupabase();
  cross.pushResponse([{ class_id: 'class-a' }]); cross.pushResponse(null);
  await assert.rejects(requireTeacherSessionScope(cross.client as never, 'teacher-a', 'student-b-session'), /FORBIDDEN/);
  const none = createFakeSupabase(); none.pushResponse([]);
  await assert.rejects(requireTeacherSessionScope(none.client as never, 'teacher-c', 'guessed'), /FORBIDDEN/);
  assert.equal(tableCalls(none.calls, 'agent_sessions').length, 0);
});

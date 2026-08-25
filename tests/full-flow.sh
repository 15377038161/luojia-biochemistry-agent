#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
STUDENT_COOKIE="/tmp/luojia-student.cookie"
TEACHER_COOKIE="/tmp/luojia-teacher.cookie"
rm -f "$STUDENT_COOKIE" "$TEACHER_COOKIE"

curl -fsS -c "$STUDENT_COOKIE" -L "$BASE_URL/api/demo-login?role=student" >/dev/null
curl -fsS -b "$STUDENT_COOKIE" "$BASE_URL/api/auth/me" > /tmp/luojia-auth.json
curl -fsS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' -d '{}' "$BASE_URL/api/student/session" > /tmp/luojia-session.json
SESSION_ID="$(python3 -c 'import json; print(json.load(open("/tmp/luojia-session.json"))["data"]["sessionId"])')"

python3 - "$SESSION_ID" > /tmp/luojia-message-body.json <<'PY'
import json, sys
json.dump({"sessionId": sys.argv[1], "content": "PCR反应中退火温度如何选择？"}, sys.stdout, ensure_ascii=False)
PY
curl -fsS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-message-body.json "$BASE_URL/api/student/messages" > /tmp/luojia-message.json

python3 - "$SESSION_ID" > /tmp/luojia-session-body.json <<'PY'
import json, sys
json.dump({"sessionId": sys.argv[1]}, sys.stdout)
PY
curl -fsS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-session-body.json "$BASE_URL/api/student/image-question" > /tmp/luojia-image.json

python3 - "$SESSION_ID" > /tmp/luojia-upload-body.json <<'PY'
import json, sys
json.dump({"sessionId": sys.argv[1], "mimeType": "image/png", "extension": "png"}, sys.stdout)
PY
curl -sS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-upload-body.json "$BASE_URL/api/student/media/upload" > /tmp/luojia-upload.json

python3 - "$SESSION_ID" > /tmp/luojia-evaluate-body.json <<'PY'
import json, sys
json.dump({"sessionId": sys.argv[1], "answer": "先根据目标基因序列设计特异性引物，设置合适退火温度并进行PCR扩增，同时设置阴性和阳性对照。"}, sys.stdout, ensure_ascii=False)
PY
curl -fsS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-evaluate-body.json "$BASE_URL/api/student/evaluate" > /tmp/luojia-evaluate.json
curl -fsS -b "$STUDENT_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-session-body.json "$BASE_URL/api/student/report" > /tmp/luojia-report.json

python3 <<'PY'
import json
assert json.load(open('/tmp/luojia-auth.json'))['user']['appRole'] == 'student'
session = json.load(open('/tmp/luojia-session.json'))
assert session['ok'] and len(session['data']['steps']) == 8
assert json.load(open('/tmp/luojia-message.json'))['ok']
assert json.load(open('/tmp/luojia-image.json'))['ok']
upload = json.load(open('/tmp/luojia-upload.json'))
assert upload.get('ok') is True or upload['error']['code'] in {'RESOURCE_MISSING', 'AI_OUTPUT_INVALID'}
assert json.load(open('/tmp/luojia-evaluate.json'))['ok']
assert json.load(open('/tmp/luojia-report.json'))['ok']
print('student-flow:ok')
PY

curl -fsS -b "$STUDENT_COOKIE" -X POST "$BASE_URL/api/auth/logout" >/dev/null
curl -fsS -c "$TEACHER_COOKIE" -L "$BASE_URL/api/demo-login?role=teacher" >/dev/null
curl -fsS -b "$TEACHER_COOKIE" -X POST -H 'Content-Type: application/json' -d '{}' "$BASE_URL/api/teacher/session" > /tmp/luojia-teacher-session.json
TEACHER_SESSION_ID="$(python3 -c 'import json; print(json.load(open("/tmp/luojia-teacher-session.json"))["data"]["id"])')"

python3 - "$TEACHER_SESSION_ID" > /tmp/luojia-teacher-query-body.json <<'PY'
import json, sys
json.dump({"sessionId": sys.argv[1], "query": "查看班级当前进度"}, sys.stdout, ensure_ascii=False)
PY
curl -fsS -b "$TEACHER_COOKIE" -X POST -H 'Content-Type: application/json' --data-binary @/tmp/luojia-teacher-query-body.json "$BASE_URL/api/teacher/query" > /tmp/luojia-teacher-query.json
curl -sS -b "$TEACHER_COOKIE" -X POST -H 'Content-Type: application/json' -d '{}' "$BASE_URL/api/teacher/reviews" > /tmp/luojia-teacher-review.json
curl -fsS -b "$TEACHER_COOKIE" "$BASE_URL/api/teacher/overview" > /tmp/luojia-teacher-overview.json

python3 <<'PY'
import json
assert json.load(open('/tmp/luojia-teacher-session.json'))['ok']
assert json.load(open('/tmp/luojia-teacher-query.json'))['ok']
assert json.load(open('/tmp/luojia-teacher-review.json'))['error']['code'] == 'VALIDATION_ERROR'
overview = json.load(open('/tmp/luojia-teacher-overview.json'))
assert overview['ok'] and isinstance(overview['data']['students'], list)
print('teacher-flow:ok')
PY

curl -fsS "$BASE_URL/" > /tmp/luojia-ui-home.html
curl -fsS "$BASE_URL/preview/student" > /tmp/luojia-ui-student.html
curl -fsS "$BASE_URL/preview/teacher" > /tmp/luojia-ui-teacher.html
INVALID_STATUS="$(curl -sS -o /tmp/luojia-ui-invalid.html -w '%{http_code}' "$BASE_URL/preview/invalid")"
curl -fsS "$BASE_URL/api/supabase-config" > /tmp/luojia-supabase.json

python3 - "$INVALID_STATUS" <<'PY'
import json, sys
home = open('/tmp/luojia-ui-home.html').read()
student = open('/tmp/luojia-ui-student.html').read()
teacher = open('/tmp/luojia-ui-teacher.html').read()
assert '游客模式 / 功能演示' in home
assert 'aria-haspopup="dialog"' in home and 'aria-expanded="false"' in home
assert 'student-agent-app' in student and '实验地图' in student
assert 'teacher-app' in teacher and '教学工作台' in teacher
assert sys.argv[1] == '404'
config = json.load(open('/tmp/luojia-supabase.json'))
assert config['url'] and config['anonKey']
print('ui-render:ok')
PY

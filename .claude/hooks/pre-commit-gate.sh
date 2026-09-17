#!/bin/bash
# 提交质量闸门：git commit 前检查两张体检通行证（+ 一次性放行通行证）
# stdout 纪律：只有 deny JSON 能上 stdout（无换行、以 { 开头 } 结尾）；日志全走 stderr
set -u
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
GATES_DIR="$PROJECT_DIR/.claude/quality-gates"
TICKET="$GATES_DIR/bypass-ticket.json"

deny() { # $1 = 原因（中文，不得含英文双引号、反斜杠、换行）
  printf '%s' "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"$1\"}}"
  exit 0
}

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).tool_input.command||'')}catch(e){console.log('')}})" 2>/dev/null)
if [ -z "$CMD" ]; then deny "无法解析提交命令，已保守拦截（请重新尝试存档）"; fi

# 把命令按 && 或 ; 拆成小段，任何一小段以 "git commit" 开头都拦（git add/status/push 等一律放行）
IS_COMMIT=$(printf '%s' "$CMD" | awk '{n=split($0,segs,/&&|;/); for(i=1;i<=n;i++){m=split(segs[i],w," "); if(w[1]=="git"&&w[2]=="commit"){print "yes"; exit}}}')
if [ "$IS_COMMIT" != "yes" ]; then exit 0; fi

# 计算当前代码指纹（含暂存+未暂存的全部改动；无改动提交时 git 自身会报错，不会走到这里）
cd "$PROJECT_DIR" || deny "进入项目目录失败，已保守拦截"
FINGERPRINT=$(git diff HEAD 2>/dev/null | git hash-object --stdin 2>/dev/null || true)
if [ -z "$FINGERPRINT" ]; then
  # 没有 HEAD 的首次提交：无通行证则拒绝（本仓库有历史，实际不会遇到）
  [ -f "$GATES_DIR/tests.pass.json" ] && [ -f "$GATES_DIR/quality.pass.json" ] && exit 0
  deny "首次提交前请先完成体检并颁发通行证"
fi

# 一次性放行通行证：通行证的指纹与当前代码一致 → 放行并立即作废
if [ -f "$TICKET" ]; then
  TICKET_FP=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.type==='bypass-ticket'&&j.fingerprint||'')}catch(e){console.log('')}})" < "$TICKET" 2>/dev/null)
  if [ "$TICKET_FP" = "$FINGERPRINT" ]; then rm -f "$TICKET"; exit 0; fi
  rm -f "$TICKET" # 通行证过期，作废
  deny "放行通行证已失效（开通行证后代码又有改动）。请重新体检，或请您再次明确批准放行"
fi

# 核对两张体检通行证
OK_T=0; OK_Q=0
if [ -f "$GATES_DIR/tests.pass.json" ]; then
  FP_T=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.gate==='unit-tests'&&j.failed===0&&j.fingerprint||'')}catch(e){console.log('')}})" < "$GATES_DIR/tests.pass.json" 2>/dev/null)
  [ "$FP_T" = "$FINGERPRINT" ] && OK_T=1
fi
if [ -f "$GATES_DIR/quality.pass.json" ]; then
  FP_Q=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.gate==='quality'&&j.highRisk===0&&j.mediumRisk===0&&j.fingerprint||'')}catch(e){console.log('')}})" < "$GATES_DIR/quality.pass.json" 2>/dev/null)
  [ "$FP_Q" = "$FINGERPRINT" ] && OK_Q=1
fi

if [ "$OK_T" = "1" ] && [ "$OK_Q" = "1" ]; then exit 0; fi
if [ "$OK_T" != "1" ] && [ "$OK_Q" != "1" ]; then
  deny "存档被门卫拦下：测试通行证和质量通行证都没有（或都已过期）。请先派 tester 与 quality-engineer 做完整体检并颁发通行证；或请您明确批准本次跳过体检（开一次性放行通行证）。"
elif [ "$OK_T" != "1" ]; then
  deny "存档被门卫拦下：单元测试还没全绿（或测试通行证过期）。请先让 tester 补测并颁发通行证；或请您明确批准本次跳过体检。"
else
  deny "存档被门卫拦下：质量体检没通过（安全审查里高危或中危不为 0，或质量通行证过期）。请先让 quality-engineer 复查并颁发通行证；或请您明确批准本次跳过体检。"
fi

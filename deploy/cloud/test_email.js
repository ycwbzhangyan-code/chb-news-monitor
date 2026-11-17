/**
 * 邮件推送本地测试脚本
 * 
 * 用法：
 *   node deploy/cloud/test_email.js
 * 
 * 会提示输入 SMTP 密码（输入时不回显），然后测试：
 * 1. SMTP 连接是否成功
 * 2. 能否发送一封测试日报邮件
 * 
 * 成功后再去配置 GitHub Secrets，避免部署完才发现发不出信。
 */
const nodemailer = require('nodemailer');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, hideInput = false) {
  return new Promise((resolve) => {
    if (!hideInput) {
      rl.question(question, (ans) => resolve(ans.trim()));
      return;
    }
    // 隐藏输入（密码不回显）
    process.stdout.write(question);
    let muted = false;
    const onData = (char) => {
      if (char.toString() === '\n' || char.toString() === '\r') {
        process.stdin.removeListener('data', onData);
      } else {
        muted = true;
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(question + '*'.repeat(8));
      }
    };
    process.stdin.on('data', onData);
    rl.question(question, (ans) => {
      process.stdout.write('\n');
      resolve(ans.trim());
    });
  });
}

async function main() {
  console.log('\n========================================');
  console.log('  创兴银行新闻监测 · 邮件推送测试');
  console.log('========================================\n');

  const smtpHost = await ask('SMTP 服务器 [smtp.163.com]: ');
  const smtpPort = await ask('SMTP 端口 [465]: ');
  const smtpUser = await ask('邮箱账号 [hnxzyan@163.com]: ');
  const smtpPass = await ask('邮箱密码（输入不回显）: ', true);
  const toAddr = await ask('测试收件人 [hnxzyan@163.com]: ');

  const host = smtpHost || 'smtp.163.com';
  const port = parseInt(smtpPort) || 465;
  const user = smtpUser || 'hnxzyan@163.com';
  const to = toAddr || user;

  console.log('\n----------------------------------------');
  console.log(`服务器: ${host}:${port}`);
  console.log(`账号:   ${user}`);
  console.log(`收件人: ${to}`);
  console.log('----------------------------------------\n');

  console.log('[1/3] 测试 SMTP 连接...');
  const transporter = nodemailer.createTransporter({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: smtpPass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });

  try {
    await transporter.verify();
    console.log('  ✅ SMTP 连接成功，账号密码有效\n');
  } catch (e) {
    console.log(`  ❌ SMTP 连接失败: ${e.message}\n`);
    console.log('可能原因排查:');
    if (e.message.includes('535') || e.message.includes('authentication failed')) {
      console.log('  → 账号或密码错误。检查密码是否正确');
      console.log('  → 若 163 提示需授权码，在 邮箱设置→POP3/SMTP/IMAP 页面找「客户端授权密码」');
      console.log('  → 确认 SMTP 服务已开启（截图显示已开启）');
    } else if (e.message.includes('ECONNREFUSED') || e.message.includes('ETIMEDOUT')) {
      console.log('  → 无法连接到服务器，检查端口号（163 用 465 SSL 或 25/994）');
      console.log('  → 检查本机防火墙或网络代理');
    } else {
      console.log(`  → 详细错误: ${e.message}`);
    }
    rl.close();
    process.exit(1);
  }

  console.log('[2/3] 发送测试邮件...');
  const testHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Microsoft YaHei',sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1565C0;color:white;padding:20px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">创兴银行新闻监测日报</h1>
    <div style="font-size:13px;opacity:.9;margin-top:5px">邮件推送测试 · 配置成功</div>
  </div>
  <div style="background:#F5F7FA;padding:15px 20px;border-left:4px solid #1565C0;margin:15px 0">
    这是一封<b>测试邮件</b>，用于验证 SMTP 配置是否正确。<br>
    如果您收到这封邮件，说明密码、服务器、端口全部配置无误，可以去 GitHub 配置 Secrets 了。
  </div>
  <div style="font-size:12px;color:#999;text-align:center;padding-top:15px;border-top:1px solid #eee">
    创兴银行新闻监测系统 · 自动发送
  </div>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from: `创兴银行新闻监测 <${user}>`,
      to,
      subject: '【创兴银行新闻监测】邮件推送测试 - 配置成功',
      html: testHtml,
    });
    console.log(`  ✅ 测试邮件已发送\n`);
    console.log(`  消息ID: ${info.messageId}`);
    console.log(`  接收地址: ${to}\n`);
  } catch (e) {
    console.log(`  ❌ 发送失败: ${e.message}\n`);
    console.log('连接成功但发送失败，通常是发件人被拒收或内容被拦截。');
    rl.close();
    process.exit(1);
  }

  console.log('[3/3] 结论');
  console.log('----------------------------------------');
  console.log('  ✅ 全部通过！请现在去 GitHub 添加 Secrets：');
  console.log('');
  console.log(`     SMTP_HOST     = ${host}`);
  console.log(`     SMTP_PORT     = ${port}`);
  console.log(`     SMTP_USER     = ${user}`);
  console.log(`     SMTP_PASS     = (你的密码)`);
  console.log(`     FROM_ADDR     = ${user}`);
  console.log(`     TO_ADDRS      = ${to}`);
  console.log('     BCC_ADDRS     = (可跳过)');
  console.log('');
  console.log('  记得去垃圾邮件箱看看，163 有时会拦截程序邮件。');
  console.log('========================================\n');

  rl.close();
  process.exit(0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});

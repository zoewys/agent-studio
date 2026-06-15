import re

with open('workflow.html', 'r') as f:
    base = f.read()

old_main = '''    <div class="main">
      <!-- 左栏 -->
      <div class="panel col-left" style="animation-delay:0.08s">
        <div class="panel-header">
          <span class="panel-title">运行队列</span>
          <span style="font-size:11px;color:var(--text-tertiary);cursor:pointer;font-weight:600;">+ 新建</span>
        </div>
        <div class="panel-body">
          <div class="run-item active">
            <div class="run-title">
              需求分析 → 设计 → 开发
              <span style="font-size:10px;color:var(--text-tertiary);">2分钟前</span>
            </div>
            <div class="run-meta">
              <span class="run-badge badge-awaiting">待确认</span>
              <span>Step 2/5</span>
            </div>
          </div>
          <div class="run-item">
            <div class="run-title">
              后端 API 重构
              <span style="font-size:10px;color:var(--text-tertiary);">5分钟前</span>
            </div>
            <div class="run-meta">
              <span class="run-badge badge-running">运行中</span>
              <span>Step 1/3</span>
            </div>
          </div>
          <div class="run-item">
            <div class="run-title">
              定时数据清洗
              <span style="font-size:10px;color:var(--text-tertiary);">1小时前</span>
            </div>
            <div class="run-meta">
              <span class="run-badge badge-done">已完成</span>
              <span>Step 4/4</span>
            </div>
          </div>
          <div class="run-item">
            <div class="run-title">
              移动端适配 review
              <span style="font-size:10px;color:var(--text-tertiary);">3小时前</span>
            </div>
            <div class="run-meta">
              <span class="run-badge badge-error">错误</span>
              <span>Step 2/3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中栏 -->
      <div class="panel col-center" style="animation-delay:0.16s">
        <div class="steps-scroll">
          <div class="step-node">
            <div class="step-seal done">✓</div>
            <div class="step-name">需求分析</div>
          </div>
          <div class="step-connector done"></div>
          <div class="step-node">
            <div class="step-seal current">◉</div>
            <div class="step-name">技术设计</div>
          </div>
          <div class="step-connector"></div>
          <div class="step-node">
            <div class="step-seal pending">○</div>
            <div class="step-name">后端开发</div>
          </div>
          <div class="step-connector"></div>
          <div class="step-node">
            <div class="step-seal pending">○</div>
            <div class="step-name">前端开发</div>
          </div>
          <div class="step-connector"></div>
          <div class="step-node">
            <div class="step-seal pending">○</div>
            <div class="step-name">测试验收</div>
          </div>
        </div>

        <div class="transcript">
          <div class="msg msg-user" style="animation-delay:0.1s">
            <div class="bubble">为 acme-web 添加 RBAC 鉴权，支持角色继承</div>
          </div>
          <div class="msg msg-assistant" style="animation-delay:0.15s">
            <div class="msg-avatar">🤖</div>
            <div class="msg-content">
              <div class="bubble">
                已分析现有鉴权逻辑。建议引入 RBAC，支持角色继承。请确认以下范围：
                <br/><br/>
                1. 是否支持 OAuth2 登录<br/>
                2. 角色粒度到菜单还是按钮级别
              </div>
              <div class="msg-thinking">
                🤔 思考中：用户是否允许引入第三方 auth 库？
              </div>
              <div class="msg-tool">
                🔧 file_read src/auth.ts (312 lines)
              </div>
              <div class="msg-tool" style="margin-left:12px;opacity:0.8;">
                ✓ exit 0
              </div>
              <div class="msg-tool">
                📝 M src/auth.ts (+45, -12)
              </div>
            </div>
          </div>
          <div class="msg-handoff" style="animation-delay:0.3s">
            <div class="msg-handoff-title">📋 Handoff · 步骤 2 完成</div>
            <div class="msg-handoff-body">
              产出鉴权设计文档和修改后的入口文件，等待确认后继续下一步。
            </div>
          </div>
          <div class="msg-usage" style="animation-delay:0.35s">
            <span>2,400 → 890 tokens · $0.0042</span>
          </div>
        </div>

        <div class="composer">
          <div class="composer-actions">
            <button class="btn btn-primary">✓ 确认继续</button>
            <button class="btn btn-warm">↻ 重跑此步</button>
            <button class="btn btn-ghost">⏭ 跳过下一步</button>
            <button class="btn btn-gold">🧠 采纳建议</button>
            <button class="btn btn-ghost" style="margin-left:auto;color:var(--accent-warm);">✕ 停止</button>
          </div>
          <div class="composer-input-wrap">
            <input class="composer-input" placeholder="回复 Agent 或输入指令..." />
            <button class="composer-send">➤</button>
          </div>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="panel col-right" style="animation-delay:0.24s">
        <div class="panel-header">
          <span class="panel-title">详情</span>
        </div>
        <div class="panel-body" style="padding:14px;">
          <div style="margin-bottom:16px;">
            <div class="detail-row">
              <span class="detail-label">状态</span>
              <span class="detail-value" style="color:var(--accent-warm);">待确认</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">模型</span>
              <span class="detail-value">claude-sonnet-4-6</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">项目</span>
              <span class="detail-value">~/projects/acme-web</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Agent</span>
              <span class="detail-value">Architect</span>
            </div>
          </div>
          <div style="margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;color:var(--text-tertiary);font-weight:600;">
              <span>预算使用</span>
              <span style="color:var(--text-primary);">$0.0042 / $0.10</span>
            </div>
            <div class="budget-bar">
              <div class="budget-fill"></div>
            </div>
          </div>
          <div style="margin-bottom:18px;">
            <div class="panel-title" style="margin-bottom:12px;text-transform:none;letter-spacing:0;font-size:12px;">产物</div>
            <div class="artifact-card">
              <div class="artifact-name">design/auth-rbac.md</div>
              <div class="artifact-desc">鉴权模块 RBAC 设计文档</div>
              <span class="artifact-tag">doc</span>
            </div>
            <div class="artifact-card">
              <div class="artifact-name">src/auth.ts</div>
              <div class="artifact-desc">修改后的鉴权入口文件</div>
              <span class="artifact-tag">code</span>
            </div>
          </div>
          <div>
            <div class="panel-title" style="margin-bottom:12px;text-transform:none;letter-spacing:0;font-size:12px;">记忆注入</div>
            <div class="memory-block">
              已注入 3 条记忆：<br/>
              · auth-pattern<br/>
              · rbac-rules<br/>
              · error-handling
            </div>
          </div>
        </div>
      </div>
    </div>'''

old_script = '''    document.querySelectorAll('.run-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.run-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      });
    });'''

old_css = '    @media (max-width: 1100px) { .col-right { display: none; } }\n  </style>'

# ========== templates.html ==========
t = base.replace('<title>经纶 · 智能体工作台</title>', '<title>模板库 · 经纶</title>')
t = t.replace('href="workflow.html" class="nav-item active">经纶', 'href="workflow.html" class="nav-item">经纶')
t = t.replace('href="templates.html" class="nav-item">模板', 'href="templates.html" class="nav-item active">模板')

new_css = '''    .dag-sidebar { width: 240px; flex-shrink: 0; }
    .dag-main { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
    .dag-canvas {
      flex: 1;
      position: relative;
      overflow: auto;
      background: var(--bg-secondary);
      border-radius: 12px;
      margin: 0 14px 14px;
      border: 1px solid var(--border);
    }
    .dag-node {
      position: absolute;
      padding: 12px 18px;
      border-radius: 12px;
      background: var(--bg-panel);
      backdrop-filter: blur(12px);
      border: 2px solid var(--border);
      font-size: 12px;
      font-weight: 700;
      cursor: grab;
      transition: all 0.3s ease;
      min-width: 120px;
      text-align: center;
      z-index: 2;
    }
    .dag-node:hover { transform: translateY(-2px); box-shadow: 0 8px 24px var(--shadow); }
    .dag-node.start { border-color: var(--accent); color: var(--accent); }
    .dag-node.agent { border-color: var(--accent-gold); color: var(--accent-gold); }
    .dag-node.end { border-color: var(--text-tertiary); color: var(--text-tertiary); }
    .dag-node.parallel { border-style: dashed; border-color: var(--accent-warm); color: var(--accent-warm); }
    .dag-edge {
      position: absolute;
      height: 2px;
      background: linear-gradient(90deg, var(--accent-soft), var(--accent-gold-soft));
      z-index: 1;
      border-radius: 1px;
    }
    .dag-edge::after {
      content: '';
      position: absolute;
      right: -4px;
      top: -3px;
      width: 0;
      height: 0;
      border-left: 6px solid var(--accent-gold);
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
    }
    .template-item {
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 1px solid transparent;
    }
    .template-item:hover { background: var(--accent-soft); }
    .template-item.active { background: var(--accent-soft); border-color: var(--accent-soft); }
    @media (max-width: 1100px) { .col-right, .dag-sidebar { display: none; } }
  </style>'''
t = t.replace(old_css, new_css)

new_main = '''    <div class="main">
      <div class="panel dag-sidebar" style="animation-delay:0.08s">
        <div class="panel-header">
          <span class="panel-title">模板库</span>
          <span style="font-size:11px;color:var(--text-tertiary);cursor:pointer;font-weight:600;">+ 新建</span>
        </div>
        <div class="panel-body">
          <div class="template-item active">
            <div style="font-size:13px;font-weight:700;margin-bottom:4px;">需求 → 设计 → 开发</div>
            <div style="font-size:10px;color:var(--text-tertiary);">5 个步骤 · 3 个 Agent</div>
          </div>
          <div class="template-item">
            <div style="font-size:13px;font-weight:700;margin-bottom:4px;">代码 Review 流水线</div>
            <div style="font-size:10px;color:var(--text-tertiary);">3 个步骤 · 2 个 Agent</div>
          </div>
          <div class="template-item">
            <div style="font-size:13px;font-weight:700;margin-bottom:4px;">定时数据清洗</div>
            <div style="font-size:10px;color:var(--text-tertiary);">2 个步骤 · 1 个 Agent</div>
          </div>
        </div>
      </div>

      <div class="panel dag-main" style="animation-delay:0.16s">
        <div class="panel-header">
          <span class="panel-title">画布</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary" style="padding:5px 12px;font-size:11px;">+ Agent 节点</button>
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:11px;">+ 并行组</button>
          </div>
        </div>
        <div class="dag-canvas">
          <div class="dag-node start" style="left:40px;top:40px;">开始</div>
          <div class="dag-edge" style="left:110px;top:55px;width:60px;"></div>
          <div class="dag-node agent" style="left:180px;top:30px;">需求分析</div>
          <div class="dag-edge" style="left:260px;top:55px;width:60px;"></div>
          <div class="dag-node agent" style="left:330px;top:30px;">技术设计</div>
          <div class="dag-edge" style="left:410px;top:55px;width:40px;transform:rotate(30deg);"></div>
          <div class="dag-node parallel" style="left:460px;top:20px;">并行开发</div>
          <div class="dag-edge" style="left:500px;top:75px;width:30px;transform:rotate(90deg);"></div>
          <div class="dag-node agent" style="left:460px;top:110px;">后端</div>
          <div class="dag-edge" style="left:540px;top:55px;width:60px;"></div>
          <div class="dag-node agent" style="left:460px;top:160px;">前端</div>
          <div class="dag-edge" style="left:620px;top:125px;width:60px;"></div>
          <div class="dag-node agent" style="left:610px;top:30px;">测试验收</div>
          <div class="dag-edge" style="left:690px;top:55px;width:60px;"></div>
          <div class="dag-node end" style="left:760px;top:40px;">结束</div>
        </div>
      </div>
    </div>'''
t = t.replace(old_main, new_main)
t = t.replace(old_script, '')
with open('templates.html', 'w') as f:
    f.write(t)

# ========== agents.html ==========
a = base.replace('<title>经纶 · 智能体工作台</title>', '<title>智能体 · 经纶</title>')
a = a.replace('href="workflow.html" class="nav-item active">经纶', 'href="workflow.html" class="nav-item">经纶')
a = a.replace('href="agents.html" class="nav-item">智能体', 'href="agents.html" class="nav-item active">智能体')

new_css2 = '''    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
      padding: 14px;
    }
    .agent-card {
      padding: 18px;
      border-radius: 14px;
      background: var(--bg-panel);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      transition: all 0.3s ease;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    .agent-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 32px var(--shadow);
      border-color: var(--accent-soft);
    }
    .agent-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: linear-gradient(to bottom, var(--accent-gold), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .agent-card:hover::before { opacity: 1; }
    .agent-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent-gold));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .agent-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
    .agent-role { font-size: 11px; color: var(--text-tertiary); margin-bottom: 10px; }
    .agent-meta { font-size: 10px; color: var(--text-tertiary); display: flex; gap: 8px; }
    .memory-list { padding: 14px; }
    .memory-item {
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      margin-bottom: 8px;
      font-size: 12px;
      transition: all 0.3s ease;
    }
    .memory-item:hover { border-color: var(--accent-gold-soft); }
    .form-group {
      margin-bottom: 18px;
      max-width: 480px;
    }
    .form-group label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      font-family: inherit;
      transition: all 0.25s ease;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-row .form-group { flex: 1; }
    @media (max-width: 1100px) { .col-right { display: none; } }
  </style>'''
a = a.replace(old_css, new_css2)

new_main2 = '''    <div class="main">
      <div class="panel col-left" style="animation-delay:0.08s">
        <div class="panel-header">
          <span class="panel-title">角色列表</span>
          <span style="font-size:11px;color:var(--text-tertiary);cursor:pointer;font-weight:600;">+ 新建</span>
        </div>
        <div class="panel-body">
          <div class="run-item active">
            <div class="run-title">Product Manager</div>
            <div class="run-meta"><span>需求分析 · claude</span></div>
          </div>
          <div class="run-item">
            <div class="run-title">Architect</div>
            <div class="run-meta"><span>技术设计 · claude</span></div>
          </div>
          <div class="run-item">
            <div class="run-title">Backend Dev</div>
            <div class="run-meta"><span>后端开发 · codex</span></div>
          </div>
          <div class="run-item">
            <div class="run-title">Frontend Dev</div>
            <div class="run-meta"><span>前端开发 · api</span></div>
          </div>
          <div class="run-item">
            <div class="run-title">QA</div>
            <div class="run-meta"><span>测试验收 · api</span></div>
          </div>
        </div>
      </div>

      <div class="panel col-center" style="animation-delay:0.16s">
        <div class="panel-header">
          <span class="panel-title">Agent 详情</span>
          <button class="btn btn-primary" style="padding:5px 12px;font-size:11px;">保存</button>
        </div>
        <div class="panel-body" style="padding:20px;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
            <div class="agent-avatar">🤖</div>
            <div>
              <div style="font-size:16px;font-weight:700;">Product Manager</div>
              <div style="font-size:12px;color:var(--text-tertiary);">需求分析 · 产品规划 · 用户调研</div>
            </div>
          </div>
          <div class="form-group">
            <label>名称</label>
            <input value="Product Manager" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>运行模式</label>
              <select><option>Claude CLI</option><option>Codex CLI</option><option>API</option></select>
            </div>
            <div class="form-group">
              <label>模型</label>
              <select><option>claude-sonnet-4-6</option><option>gpt-4o</option></select>
            </div>
          </div>
          <div class="form-group">
            <label>系统提示词</label>
            <textarea>你是一位资深产品经理。你的职责是分析需求、撰写PRD、梳理用户故事，并确保技术方案符合业务目标。</textarea>
          </div>
        </div>
      </div>

      <div class="panel col-right" style="animation-delay:0.24s">
        <div class="panel-header">
          <span class="panel-title">记忆库</span>
        </div>
        <div class="panel-body memory-list">
          <div class="memory-item">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;">auth-pattern</div>
            <div style="font-size:11px;color:var(--text-tertiary);">项目使用 JWT + RBAC 的鉴权模式，token 有效期 2 小时。</div>
          </div>
          <div class="memory-item">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;">rbac-rules</div>
            <div style="font-size:11px;color:var(--text-tertiary);">角色分为 admin、editor、viewer 三级，权限粒度到按钮级别。</div>
          </div>
          <div class="memory-item">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;">error-handling</div>
            <div style="font-size:11px;color:var(--text-tertiary);">API 统一返回 {code, message, data} 格式，HTTP 状态码只用 200/400/500。</div>
          </div>
          <div class="memory-item">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;">deploy-flow</div>
            <div style="font-size:11px;color:var(--text-tertiary);">CI/CD 使用 GitHub Actions，部署到 AWS ECS，蓝绿发布。</div>
          </div>
        </div>
      </div>
    </div>'''
a = a.replace(old_main, new_main2)
with open('agents.html', 'w') as f:
    f.write(a)

# ========== single.html ==========
s = base.replace('<title>经纶 · 智能体工作台</title>', '<title>单次对话 · 经纶</title>')
s = s.replace('href="workflow.html" class="nav-item active">经纶', 'href="workflow.html" class="nav-item">经纶')
s = s.replace('href="single.html" class="nav-item">单次', 'href="single.html" class="nav-item active">单次')

new_css3 = '''    .single-config {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .config-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .config-field label {
      font-size: 10px;
      color: var(--text-tertiary);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .config-field select, .config-field input {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
      font-family: inherit;
    }
    @media (max-width: 1100px) { .col-right { display: none; } }
  </style>'''
s = s.replace(old_css, new_css3)

new_main3 = '''    <div class="main">
      <div class="panel col-left" style="animation-delay:0.08s;width:220px;">
        <div class="panel-header">
          <span class="panel-title">历史</span>
        </div>
        <div class="panel-body">
          <div class="run-item">
            <div class="run-title">重构 auth 模块</div>
            <div class="run-meta"><span>昨天 · claude</span></div>
          </div>
          <div class="run-item">
            <div class="run-title">写 API 文档</div>
            <div class="run-meta"><span>3天前 · codex</span></div>
          </div>
        </div>
      </div>

      <div class="panel col-center" style="animation-delay:0.16s">
        <div class="single-config">
          <div class="config-field">
            <label>Vendor</label>
            <select><option>Claude CLI</option><option>Codex CLI</option><option>API</option></select>
          </div>
          <div class="config-field">
            <label>模型</label>
            <select><option>claude-sonnet-4-6</option><option>gpt-4o</option><option>deepseek-chat</option></select>
          </div>
          <div class="config-field">
            <label>项目路径</label>
            <input value="~/projects/acme-web" />
          </div>
          <div class="config-field">
            <label>Agent</label>
            <select><option>Architect</option><option>Backend Dev</option></option></select>
          </div>
        </div>
        <div class="transcript">
          <div class="msg msg-user">
            <div class="bubble">帮我重构 auth 模块，改用 RBAC</div>
          </div>
          <div class="msg msg-assistant">
            <div class="msg-avatar">🤖</div>
            <div class="msg-content">
              <div class="bubble">好的，我来分析现有 auth 模块并给出 RBAC 重构方案。</div>
              <div class="msg-tool">🔧 file_read src/auth.ts</div>
              <div class="msg-tool">🔧 file_read src/middleware/auth.ts</div>
              <div class="msg-tool">📝 M src/auth.ts (+120, -80)</div>
            </div>
          </div>
          <div class="msg-usage">
            <span>4,200 → 1,890 tokens · $0.0084</span>
          </div>
        </div>
        <div class="composer">
          <div class="composer-input-wrap">
            <input class="composer-input" placeholder="发送消息..." />
            <button class="composer-send">➤</button>
          </div>
        </div>
      </div>

      <div class="panel col-right" style="animation-delay:0.24s;width:240px;">
        <div class="panel-header">
          <span class="panel-title">运行参数</span>
        </div>
        <div class="panel-body" style="padding:14px;">
          <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value" style="color:var(--accent);">运行中</span></div>
          <div class="detail-row"><span class="detail-label">模型</span><span class="detail-value">claude-sonnet-4-6</span></div>
          <div class="detail-row"><span class="detail-label">耗时</span><span class="detail-value">2m 14s</span></div>
          <div class="detail-row"><span class="detail-label">Cost</span><span class="detail-value">$0.0084</span></div>
        </div>
      </div>
    </div>'''
s = s.replace(old_main, new_main3)
with open('single.html', 'w') as f:
    f.write(s)

# ========== settings.html ==========
st = base.replace('<title>经纶 · 智能体工作台</title>', '<title>设置 · 经纶</title>')
st = st.replace('href="workflow.html" class="nav-item active">经纶', 'href="workflow.html" class="nav-item">经纶')
st = st.replace('href="settings.html" class="nav-item">设置', 'href="settings.html" class="nav-item active">设置')

new_css4 = '''    .settings-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .settings-nav {
      width: 200px;
      border-right: 1px solid var(--border);
      padding: 12px;
      flex-shrink: 0;
    }
    .settings-nav-item {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 2px;
      font-weight: 500;
    }
    .settings-nav-item:hover { background: var(--accent-soft); color: var(--accent); }
    .settings-nav-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
    .settings-content {
      flex: 1;
      overflow: auto;
      padding: 20px 28px;
    }
    .settings-section-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--text-primary);
    }
    .form-group {
      margin-bottom: 18px;
      max-width: 480px;
    }
    .form-group label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      font-family: inherit;
      transition: all 0.25s ease;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-row .form-group { flex: 1; }
    .toggle-switch {
      width: 40px;
      height: 22px;
      border-radius: 11px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      position: relative;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .toggle-switch.on {
      background: var(--accent);
      border-color: var(--accent);
    }
    .toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .toggle-switch.on::after { transform: translateX(18px); }
    @media (max-width: 1100px) { .col-right, .dag-sidebar { display: none; } }
    @media (max-width: 800px) { .col-left, .settings-nav { display: none; } }
  </style>'''
st = st.replace(old_css, new_css4)

new_main4 = '''    <div class="settings-layout">
      <div class="settings-nav">
        <div class="settings-nav-item active">CLI 工具</div>
        <div class="settings-nav-item">API 供应商</div>
        <div class="settings-nav-item">数据管理</div>
        <div class="settings-nav-item">通知</div>
        <div class="settings-nav-item">Memory</div>
        <div class="settings-nav-item">关于</div>
      </div>
      <div class="settings-content">
        <div class="settings-section-title">CLI 工具</div>
        <div class="form-group">
          <label>Claude Code 路径</label>
          <input value="/usr/local/bin/claude" />
        </div>
        <div class="form-group">
          <label>Codex CLI 路径</label>
          <input value="/usr/local/bin/codex" />
        </div>
        <div class="form-group">
          <label>自动更新 CLI</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
            <div class="toggle-switch on"></div>
            <span style="font-size:12px;color:var(--text-secondary);">开启</span>
          </div>
        </div>

        <div style="height:1px;background:var(--border);margin:24px 0;"></div>
        <div class="settings-section-title">API 供应商</div>
        <div class="form-group">
          <label>DeepSeek API Key</label>
          <input type="password" value="sk-xxxxxxxx" />
        </div>
        <div class="form-group">
          <label>OpenAI API Key</label>
          <input type="password" value="sk-yyyyyyyy" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Kimi API Key</label>
            <input type="password" value="sk-zzzzzzzz" />
          </div>
          <div class="form-group">
            <label>MiMo API Key</label>
            <input type="password" value="sk-wwwwwwww" />
          </div>
        </div>

        <div style="height:1px;background:var(--border);margin:24px 0;"></div>
        <div class="settings-section-title">通知</div>
        <div class="form-group">
          <label>Feishu Webhook</label>
          <input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
        </div>
        <div class="form-group">
          <label>启用通知</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
            <div class="toggle-switch"></div>
            <span style="font-size:12px;color:var(--text-secondary);">关闭</span>
          </div>
        </div>
      </div>
    </div>'''
st = st.replace(old_main, new_main4)

new_script2 = '''    document.querySelectorAll('.settings-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      });
    });'''
st = st.replace(old_script, new_script2)
with open('settings.html', 'w') as f:
    f.write(st)

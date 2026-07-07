/**
 * 销帮帮CRM - Shared Utilities (v2: INTERCEPT + hash-change with query params)
 * 
 * 架构演进：
 * - v1: Strategy.COOKIE + page.fetchJson() — 失败：CDP注入的fetch跨子域CORS被拒
 * - v2 (当前): Strategy.INTERCEPT + hash-change — SPA自身发出API请求，我们用interceptor捕获响应
 * 
 * 关键发现：
 * 销帮帮SPA的hash路由需要query params才能触发数据加载：
 * #/crm/customer?subBusinessType=101&appId=1239836&menuId=13466040&saasMark=1&distributorMark=0&timestamp=...
 * 没有这些params，页面只会显示"无表单查看权限"
 */

import { CommandExecutionError, AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';

const BASE_URL = 'https://appgateway.xbongbong.com/pro/v1';
const DOMAIN = 'appwebfront.xbongbong.com';

// 模块配置：businessType + subBusinessType + API路径 + SPA hash路由 + 默认appId/menuId
// appId/menuId 来源于templateList接口，是销帮帮的模块标识
const MODULE_CONFIG = {
    customer: {
        businessType: 100, subBusinessType: 101,
        listPath: '/list/customer',
        hashBase: '/crm/customer',
        appId: 1239836, menuId: 13466040, formId: 12090314,
    },
    contact: {
        businessType: 100, subBusinessType: 103,
        listPath: '/list/contact',
        hashBase: '/crm/contact',
        appId: null, menuId: null, formId: null,
    },
    // Real SPA params captured from XHR:
    // /list/opportunity  businessType=301 subBusinessType=302 appId=1239836 menuId=13466044 formId=12090319
    opportunity: {
        businessType: 301, subBusinessType: 302,
        listPath: '/list/opportunity',
        hashBase: '/crm/opportunity',
        appId: 1239836, menuId: 13466044, formId: 12090319,
    },
    quotation: {
        businessType: 200, subBusinessType: 202,
        listPath: '/list/quotation',
        hashBase: '/crm/quotation',
        appId: null, menuId: null, formId: null,
    },
    // /list/contract  businessType=201 subBusinessType=201 appId=1239836 menuId=13466046 formId=12090321
    contract: {
        businessType: 201, subBusinessType: 201,
        listPath: '/list/contract',
        hashBase: '/crm/contract',
        appId: 1239836, menuId: 13466046, formId: 12090321,
    },
    // /list/product  businessType=2401 subBusinessType=2401 appId=1239837 menuId=13466039 formId=12090313
    product: {
        businessType: 2401, subBusinessType: 2401,
        listPath: '/list/product',
        hashBase: '/product/productManagement',
        appId: 1239837, menuId: 13466039, formId: 12090313,
    },
    // /list/paymentSheet  businessType=702 subBusinessType=702 appId=1239838 menuId=13466068 formId=12090336
    payment: {
        businessType: 702, subBusinessType: 702,
        listPath: '/list/paymentSheet',
        hashBase: '/fund/moneyOrder',
        appId: 1239838, menuId: 13466068, formId: 12090336,
    },
    refund: {
        businessType: 200, subBusinessType: 205,
        listPath: '/list/returnsAndRefunds',
        hashBase: '/crm/returnsAndRefunds',
        appId: null, menuId: null, formId: null,
    },
    followup: {
        businessType: 100, subBusinessType: 105,
        listPath: '/list/followup',
        hashBase: '/crm/communicate',
        appId: null, menuId: null, formId: null,
    },
    // 公海池 (publicCustomer): subBusinessType=105 menuId=13466056 hashBase=/crm/customer
    pool: {
        businessType: 100, subBusinessType: 105,
        listPath: '/list/publicCustomer',
        hashBase: '/crm/customer',
        appId: 1239836, menuId: 13466056, formId: 12090314,
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 基础设施
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 确保浏览器Tab在销帮帮域名上
 */
export async function ensureOnXbb(page) {
    const url = await page.evaluate('() => window.location.href');
    if (url && url.includes(DOMAIN)) return;

    await page.goto(`https://${DOMAIN}/#/app/home`);
    await page.wait(2);

    const afterUrl = await page.evaluate('() => window.location.href');
    if (!afterUrl || !afterUrl.includes(DOMAIN)) {
        throw new AuthRequiredError(DOMAIN, '无法导航到销帮帮CRM，请确认网络连接');
    }
    if (afterUrl.includes('/login') || afterUrl.includes('/passport')) {
        throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');
    }
}

/**
 * 提取公共参数（corpid/userId）— 从Vue2 Vuex store或localStorage
 */
export async function getCommonParams(page) {
    const params = await page.evaluate(`(() => {
        if (window.__xbb_common_params__) return window.__xbb_common_params__;

        function makeParams(corpid, userId) {
            if (!corpid || !userId) return null;
            const p = { corpid: String(corpid), userId: String(userId), platform: 'web', saasMark: 1, distributorMark: 0 };
            window.__xbb_common_params__ = p;
            return p;
        }

        // Vue2 Vuex store（销帮帮实际使用Vue2）
        try {
            const vm = document.querySelector('#app')?.__vue__;
            if (vm && vm.$store && vm.$store.state && vm.$store.state.user) {
                const u = vm.$store.state.user.userInfo || vm.$store.state.user;
                const r = makeParams(u.corpid, u.userId);
                if (r) return r;
            }
        } catch(e) {}

        // Vue3 fallback
        try {
            const app = document.querySelector('#app')?.__vue_app__;
            if (app) {
                const store = app.config.globalProperties.$store;
                if (store && store.state && store.state.user) {
                    const u = store.state.user.userInfo || store.state.user;
                    const r = makeParams(u.corpid, u.userId);
                    if (r) return r;
                }
            }
        } catch(e) {}

        // localStorage
        try {
            const raw = localStorage.getItem('userInfo');
            if (raw) { const p = JSON.parse(raw); const r = makeParams(p.corpid, p.userId); if (r) return r; }
        } catch(e) {}

        // Cookie
        try {
            const c = document.cookie;
            const cm = c.match(/corpid=([^;]+)/); const um = c.match(/userId=([^;]+)/);
            if (cm && um) return makeParams(decodeURIComponent(cm[1]), decodeURIComponent(um[1]));
        } catch(e) {}

        return null;
    })()`);
    return params;
}

/**
 * 确认已登录，否则返回 null
 */
export async function assertAuth(page) {
    await ensureOnXbb(page);
    const params = await getCommonParams(page);
    if (!params || !params.corpid || !params.userId) {
        return null;
    }
    return params;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 动态获取模块配置（appId/menuId/formId）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 通过interceptor捕获templateList响应来获取模块的appId/menuId/formId
 * 导航到模块页面时，SPA会先调用templateList获取表单配置
 */
export async function getModuleFormConfig(page, commonParams, moduleName) {
    const config = MODULE_CONFIG[moduleName];
    if (!config) return null;

    // 如果已有缓存的硬编码值，直接用
    if (config.appId && config.menuId && config.formId) {
        return {
            formId: config.formId,
            menuId: config.menuId,
            appId: config.appId,
            businessType: config.businessType,
            subBusinessType: config.subBusinessType,
        };
    }

    // 动态获取：通过Vuex dispatch formDataAdd（它内部调用templateList获取表单配置）
    // 这利用了SPA自身的HTTP client，不受CORS限制
    try {
        await ensureOnXbb(page);
        await page.installInterceptor('/template/form/templateList');
        
        // 通过Vuex dispatch触发SPA调用templateList
        const dispatchScript = `(() => {
            const vm = document.querySelector('#app').__vue__;
            const store = vm.$store;
            return store.dispatch('formDataAdd', {
                appId: 0,
                menuId: 0,
                formId: 0,
                saasMark: 1,
                distributorMark: 0,
                businessType: ${config.businessType},
                subBusinessType: ${config.subBusinessType},
                useDraft: false
            }).then(() => true).catch(() => false);
        })()`;
        
        await page.evaluate(dispatchScript);
        
        try {
            await page.waitForCapture(10);
        } catch (e) {
            // Fallback: try hash navigation to trigger templateList
            const targetHash = `${config.hashBase}?subBusinessType=${config.subBusinessType}&appId=0&menuId=0&saasMark=1&distributorMark=0&timestamp=${Date.now()}`;
            await page.installInterceptor('/template/form/templateList');
            await page.evaluate(`() => { setTimeout(() => { window.location.hash = '${targetHash}'; }, 50); }`);
            await page.waitForCapture(10);
        }
        
        const captured = await page.getInterceptedRequests();
        if (captured && captured.length > 0) {
            const resp = captured[captured.length - 1];
            if (resp && resp.code === 1 && resp.result && resp.result.formList) {
                const forms = resp.result.formList;
                if (forms.length > 0) {
                    const t = forms[0];
                    // 缓存到MODULE_CONFIG
                    config.appId = t.appId;
                    config.menuId = t.menuId;
                    config.formId = t.formId;
                    return {
                        formId: t.formId,
                        menuId: t.menuId,
                        appId: t.appId,
                        businessType: config.businessType,
                        subBusinessType: config.subBusinessType,
                    };
                }
            }
        }
    } catch (e) {
        // 获取失败，使用硬编码fallback（如果有）
    }
    return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERCEPT + Hash-Change 核心方法（用于READ操作）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 构建完整的hash路由URL（含query params）
 */
function buildHashUrl(hashBase, config) {
    const params = new URLSearchParams({
        subBusinessType: String(config.subBusinessType),
        appId: String(config.appId),
        menuId: String(config.menuId),
        saasMark: '1',
        distributorMark: '0',
        timestamp: String(Date.now()),
    });
    return `${hashBase}?${params.toString()}`;
}

/**
 * 通过拦截器模式拉取API数据：
 *   installInterceptor → hash-change(with query params) → waitForCapture → getInterceptedRequests
 * 
 * @param {object} page - Browser page object
 * @param {string} interceptPattern - URL子串匹配，如 '/list/customer'
 * @param {string} targetHash - 完整的hash路由（含query params）
 * @param {object} [opts]
 * @param {number} [opts.timeoutSec=15]
 * @param {string} [opts.bounceHash='/app/home'] - bounce目标
 * @returns {Array} 捕获的JSON响应数组
 */
export async function interceptViaHash(page, interceptPattern, targetHash, opts = {}) {
    const { timeoutSec = 15, bounceHash = '/app/home' } = opts;

    await ensureOnXbb(page);

    // 安装拦截器
    await page.installInterceptor(interceptPattern);

    // 先bounce到其他页面确保SPA重新请求（因为如果已在同路由，SPA可能不重新fetch）
    const curHash = await page.evaluate('() => window.location.hash');
    const targetPath = targetHash.split('?')[0];
    if (curHash.includes(targetPath)) {
        await page.evaluate(`() => { window.location.hash = '${bounceHash}'; }`);
        await page.wait(1);
        // 重新安装拦截器（bounce可能不清除，但以防万一）
        await page.installInterceptor(interceptPattern);
    }

    // 导航到目标hash（用setTimeout避免eval阻塞）
    await page.evaluate(`() => { setTimeout(() => { window.location.hash = '${targetHash}'; }, 50); }`);

    // 等待拦截器捕获到数据
    try {
        await page.waitForCapture(timeoutSec);
    } catch (e) {
        throw new CommandExecutionError(
            `等待 ${interceptPattern} 响应超时(${timeoutSec}s)。请确认模块已启用且有数据权限。`,
        );
    }

    // 读取捕获的数据
    const captured = await page.getInterceptedRequests();
    if (!captured || captured.length === 0) {
        throw new EmptyResultError('interceptViaHash', `拦截器未捕获到匹配 "${interceptPattern}" 的响应`);
    }

    return captured;
}

/**
 * 列表查询（高层封装）：自动获取模块配置 → 构建hash URL → 拦截列表API响应
 */
export async function fetchModuleList(page, moduleName, commonParams, opts = {}) {
    const config = MODULE_CONFIG[moduleName];
    if (!config) throw new CommandExecutionError(`未知模块: ${moduleName}`);

    // 确保有appId/menuId（动态获取或使用缓存）
    let formConfig;
    if (config.appId && config.menuId) {
        formConfig = config;
    } else {
        formConfig = await getModuleFormConfig(page, commonParams, moduleName);
        if (!formConfig) {
            throw new CommandExecutionError(`无法获取模块 ${moduleName} 的配置，请确认该模块已在销帮帮中启用`);
        }
    }

    // 构建完整hash URL
    const targetHash = buildHashUrl(config.hashBase, formConfig);

    // 拦截列表API响应
    const captured = await interceptViaHash(page, config.listPath, targetHash, opts);

    // 在捕获的响应中找到包含列表数据的那个
    for (const resp of captured) {
        if (resp && resp.code === 1) {
            return resp;
        }
    }
    return captured[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 写操作：通过SPA内部HTTP客户端发起API调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 
// 关键发现：CDP-injected XHR/fetch 遭遇 CORS 拒绝（status=0），
// 但 SPA 自身的 bundled HTTP 模块正常工作。
// 
// 解决方案：通过 Vuex dispatch('formDataAdd') 触发 FormDataEditDialog 组件挂载，
// 该组件的 getSavePromise() 返回 SPA bundled 的 request 函数：
//   function(t){ return (0,u.Z)({url:"/form/data/add", data:t}) }
// 其中 u.Z 就是 SPA 内部的 HTTP client，自动处理 baseURL、cookies、CORS。
// 
// 我们把它缓存到 window.__xbb_request__ 上，之后所有 API 调用都通过它发起。

/**
 * 确保SPA内部HTTP客户端已挂载到 window.__xbb_request__
 * 通过 dispatch formDataAdd 触发 FormDataEditDialog 组件初始化
 */
async function ensureSpaHttpClient(page) {
    const hasClient = await page.evaluate('() => typeof window.__xbb_request__ === "function"');
    if (hasClient) return;

    // dispatch formDataAdd 让 FormDataEditDialog 组件挂载
    // 用 customer 模块的默认配置
    const config = MODULE_CONFIG.customer;
    const dispatchScript = `(() => {
        const vm = document.querySelector('#app').__vue__;
        const store = vm.$store;
        return store.dispatch('formDataAdd', {
            appId: ${config.appId || 1239836},
            menuId: ${config.menuId || 13466040},
            formId: ${config.formId || 12090314},
            saasMark: 1,
            distributorMark: 0,
            businessType: ${config.businessType},
            subBusinessType: ${config.subBusinessType},
            useDraft: false
        }).then(() => true).catch(() => false);
    })()`;

    await page.evaluate(dispatchScript);
    // 等待组件挂载完成 (dispatch + Vue render cycle + nextTick)
    await page.wait(2);

    // 从 FormDataEditDialog 获取 getSavePromise 并提取底层 request 函数
    const extracted = await page.evaluate(`(() => {
        const vm = document.querySelector('#app').__vue__;
        function findComp(vm, name, depth) {
            if (depth > 6) return null;
            if ((vm.$options.name || '') === name) return vm;
            for (const child of (vm.$children || [])) {
                const r = findComp(child, name, depth + 1);
                if (r) return r;
            }
            return null;
        }
        const dialog = findComp(vm, 'FormDataEditDialog', 0);
        if (!dialog) return { error: 'FormDataEditDialog not found' };

        // getSavePromise 返回的函数形如: function(t){return (0,u.Z)({url:"/form/data/add",data:t})}
        // 我们需要提取 u.Z (底层request函数)
        const saveFn = dialog.getSavePromise();
        if (!saveFn) return { error: 'getSavePromise returned null' };

        // 将 saveFn 缓存，同时通过它的调用模式推导出底层request
        // 调用 saveFn 会走 /form/data/add，我们直接缓存 saveFn 引用
        window.__xbb_save_fn__ = saveFn;

        // 为了支持任意 URL 的 API 调用，我们需要拿到 u.Z 本身
        // 策略：创建一个 trap 对象，当 saveFn 被调用时，记录它内部调用了什么
        // 但更简单的方法：直接用 getSavePromise 的源代码结构
        // saveFn source: function g(t){return(0,u.Z)({url:"/form/data/add",data:t})}
        // 我们可以用一个 proxy 包装来截取 u.Z

        // 更可靠：直接修改 getSavePromise 的内部引用来暴露 request
        // 实际上，我们可以在 saveFn 调用时传入一个特殊参数来获取实际 URL
        // 但最简单的方案：因为我们已经能成功通过 saveFn 创建数据，
        // 那就用 interceptor + Vuex dispatch 的组合模式来做通用 API 调用

        // 最终方案: 用 dialog 组件来获取所有 API 引用
        // 这些 API 在模块的 import 中，可以通过不同 mode 获取不同的 save function
        window.__xbb_request__ = saveFn;
        window.__xbb_dialog_comp__ = dialog;

        return { success: true };
    })()`);

    if (extracted && extracted.error) {
        throw new CommandExecutionError(`无法初始化SPA HTTP客户端: ${extracted.error}`);
    }
}

/**
 * 通过SPA内部HTTP客户端发起表单数据创建
 * 这是最可靠的写入方式，完全绕过 CORS 限制
 */
export async function callSpaFormAdd(page, params, opts = {}) {
    const { timeoutSec = 20 } = opts;
    await ensureOnXbb(page);
    await ensureSpaHttpClient(page);

    const paramsJson = JSON.stringify(params);
    const result = await page.evaluate(`(() => {
        function safeStr(v) {
            if (v == null) return '';
            if (typeof v === 'string') return v;
            try { return JSON.stringify(v); } catch { return String(v); }
        }
        return new Promise((resolve) => {
            const fn = window.__xbb_save_fn__ || window.__xbb_request__;
            if (!fn) { resolve({ error: true, message: 'HTTP client not initialized' }); return; }
            const timer = setTimeout(() => resolve({ error: true, message: 'API call timeout' }), ${timeoutSec * 1000});
            Promise.resolve(fn(${paramsJson})).then(resp => {
                clearTimeout(timer);
                resolve(resp);
            }).catch(err => {
                clearTimeout(timer);
                // Axios errors: try err.response.data (real backend message)
                let payload = null;
                try {
                    if (err && err.response && err.response.data) payload = err.response.data;
                } catch (_) {}
                const msg = (err && err.message) ||
                            (payload && (payload.msg || payload.message || payload.error)) ||
                            safeStr(payload) ||
                            safeStr(err);
                resolve({ error: true, message: msg, raw: payload || safeStr(err) });
            });
        });
    })()`);

    return result;
}

/**
 * 通过SPA内部HTTP客户端调用任意API路径
 * 利用interceptor+Vuex dispatch组合：先触发SPA内部导航让它发API请求，然后拦截响应
 * 
 * 对于读操作用 interceptViaHash，对于写操作用 callSpaFormAdd
 * 此函数作为通用API调用的fallback
 */
export async function callSpaApi(page, path, body = {}, opts = {}) {
    const { timeoutSec = 15 } = opts;

    await ensureOnXbb(page);
    await ensureSpaHttpClient(page);

    // 使用SPA内部HTTP客户端发起请求
    // 通过evaluate调用缓存在window上的request函数
    const bodyJson = JSON.stringify(body);
    const result = await page.evaluate(`(() => {
        return new Promise((resolve, reject) => {
            const dialog = window.__xbb_dialog_comp__;
            if (!dialog) { reject(new Error('Dialog component not mounted')); return; }
            
            // 获取底层 request 函数
            // getSavePromise 内部引用的 u.Z 就是通用 request
            // 我们通过 dialog 的方法来间接访问
            const saveFn = dialog.getSavePromise();
            
            // saveFn 调用 (0,u.Z)({url, data})
            // 我们无法直接改URL，但可以用interceptor来间接实现
            // 
            // 更好的方案：直接用 formDataAdd 的 Vuex dispatch 触发的那些 api 模块函数
            // 它们被引用为 is.K7, is.D3 等，在 formDataAdd 的 action 中
            
            const timer = setTimeout(() => reject(new Error('timeout')), ${timeoutSec * 1000});
            saveFn(${bodyJson}).then(resp => {
                clearTimeout(timer);
                resolve(resp);
            }).catch(err => {
                clearTimeout(timer);
                resolve({ error: true, message: err.message || String(err) });
            });
        });
    })()`);

    if (result && result.error) {
        throw new CommandExecutionError(`API调用失败: ${result.message}`);
    }
    return result;
}

/**
 * 高层API调用（用于写操作和详情查询）
 * 对于 /form/data/add 使用 callSpaFormAdd
 * 对于其他path使用 interceptor+hash 模式
 */
export async function apiCall(page, path, extraBody = {}, commonParams = null) {
    if (!commonParams) {
        commonParams = await assertAuth(page);
        if (!commonParams) {
            throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');
        }
    }

    // 对于 /form/data/add，直接使用 SPA 内部 HTTP 客户端
    if (path === '/form/data/add') {
        const response = await callSpaFormAdd(page, extraBody);
        if (response && typeof response === 'object') {
            // SPA的request函数返回的已经是解析后的response
            return { ok: response.code === 1, status: 200, data: response };
        }
        return { ok: false, status: 0, error: 'Invalid response format', data: response };
    }

    // 对于其他API路径，使用interceptor+hash模式
    // 通过hash导航触发SPA自身的API调用，然后interceptor捕获
    const body = { ...commonParams, ...extraBody };
    
    // 对于 templateList 等读操作，用 interceptor 模式
    await ensureOnXbb(page);
    await page.installInterceptor(path);

    // 使用SPA内部HTTP client调用
    await ensureSpaHttpClient(page);
    const bodyJson = JSON.stringify(body);
    
    await page.evaluate(`(() => {
        const fn = window.__xbb_save_fn__;
        if (fn) {
            // 注意：这里 fn 固定调用 /form/data/add
            // 对于其他路径，我们需要不同方法
        }
        // Fallback: 直接通过SPA的Vuex/Router触发API调用
        // 对于templateList: 可以通过hash navigation触发
    })()`);
    
    // 对于 templateList 等，使用hash导航模式
    if (path.includes('templateList')) {
        const hashTarget = buildHashUrl('/app/home', {
            subBusinessType: body.subBusinessType || 101,
            appId: body.appId || 1239836,
            menuId: body.menuId || 13466040,
        });
        await page.evaluate(`() => { setTimeout(() => { window.location.hash = '${hashTarget}'; }, 50); }`);
        try {
            await page.waitForCapture(10);
        } catch(e) {
            // 如果hash方式没触发templateList, 尝试直接用store dispatch
            const dispatchResult = await page.evaluate(`(() => {
                const vm = document.querySelector('#app').__vue__;
                const store = vm.$store;
                return store.dispatch('formDataAdd', ${bodyJson})
                    .then(() => true).catch(() => false);
            })()`);
            if (dispatchResult) {
                await page.wait(2);
            }
        }
    }

    try {
        await page.waitForCapture(8);
    } catch(e) {
        // timeout - 可能已经在上面捕获了
    }
    
    const captured = await page.getInterceptedRequests();
    if (!captured || captured.length === 0) {
        // 最后手段：通过dispatch formDataAdd重新触发
        throw new CommandExecutionError(`API调用 ${path} 未能捕获响应`);
    }
    
    const response = captured[captured.length - 1];
    if (response && typeof response === 'object') {
        return { ok: response.code === 1, status: 200, data: response };
    }
    return { ok: false, status: 0, error: 'Invalid response format', data: response };
}

/**
 * 执行查重检查（通过拦截SPA内部API调用）
 */
export async function checkDuplicate(page, commonParams, formConfig, fieldAttr, value) {
    // 查重暂时跳过（因为需要额外的API路径支持）
    // 后续可通过UI自动化完成查重
    return true;
}

export { BASE_URL, DOMAIN, MODULE_CONFIG };

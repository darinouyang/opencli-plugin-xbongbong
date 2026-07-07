import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, callSpaFormAdd, getModuleFormConfig, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'product-create',
    access: 'write',
    description: '录入新产品到销帮帮CRM产品目录',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'name', type: 'string', required: true, positional: true, help: '产品名称（必填）' },
        { name: 'price', type: 'float', help: '产品单价' },
        { name: 'unit', type: 'string', help: '计量单位（如：个、套、年）' },
        { name: 'category', type: 'string', help: '产品分类' },
        { name: 'description', type: 'string', help: '产品描述' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.name || args.name.trim() === '') {
            throw new ArgumentError('产品名称不能为空');
        }

        // 获取产品模块的 formId/menuId
        let formConfig = await getModuleFormConfig(page, commonParams, 'product');
        if (!formConfig) {
            // fallback: 使用 MODULE_CONFIG 中的静态配置
            const c = MODULE_CONFIG.product;
            formConfig = {
                formId: c.formId,
                menuId: c.menuId,
                appId: c.appId,
                businessType: c.businessType,
                subBusinessType: c.subBusinessType,
            };
        }

        // 构建产品 dataList
        // 注意: 销帮帮产品表单要求"产品编号"必填，本CLI自动生成
        const autoCode = 'AUTO-' + Date.now();

        const dataList = {
            template: formConfig.formId,
            text_1: args.name,                    // 产品名称
            text_2: autoCode,                     // 产品编号（自动生成）
            number_1: args.price || null,         // 单价
            text_3: args.unit || null,            // 单位
            text_4: args.category || null,        // 分类
            textarea_1: args.description || null, // 描述
        };

        const body = {
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            saasMark: 2,
            distributorMark: 0,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            groupNumber: '',
            isBatch: 0,
            dataList: dataList,
        };

        function toMsg(v) {
            if (v == null) return '';
            if (typeof v === 'string') return v;
            if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 500); } catch { return '[unserializable]'; } }
            return String(v);
        }

        const resp = await callSpaFormAdd(page, body);
        if (process.env.XBB_DEBUG) process.stderr.write('[xbb-debug] product-create resp=' + toMsg(resp) + '\n');

        if (!resp || resp.error) {
            throw new CommandExecutionError(`创建产品失败: ${toMsg(resp) || 'unknown error'}`);
        }

        if (resp.code !== 1) {
            throw new CommandExecutionError(`创建产品失败: ${toMsg(resp) || '未知错误'}`);
        }

        const result = resp.result || resp;
        const newId = result.dataId || result.formDataId || result.id || 'unknown';

        return [{
            id: String(newId),
            name: args.name,
            status: 'success',
            message: '产品创建成功',
        }];
    },
});

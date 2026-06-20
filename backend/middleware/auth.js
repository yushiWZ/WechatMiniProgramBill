/**
 * ============================================================
 * 智能记账本 - JWT 认证中间件
 * ============================================================
 *
 * 本文件实现 Express 中间件，用于验证每个请求的用户身份。
 *
 * 【认证流程】
 *   1. 前端在登录成功后获得 JWT Token，后续每个请求都在 HTTP 请求头中携带：
 *      Authorization: Bearer <token>
 *   2. 本中间件从请求头提取 Token，使用 jwtSecret 验证其签名和有效期
 *   3. 验证通过后，将 Token 中的用户信息（userId、openid）注入到 req 对象，
 *      供后续路由使用（如 req.userId 获取当前用户 ID）
 *   4. 验证失败（Token 缺失、格式错误、签名无效、已过期）时，
 *      直接返回 HTTP 401 未授权响应，请求不会到达后续路由
 *
 * 【使用方式】
 *   在需要认证的路由中添加 auth 中间件，例如：
 *     router.get('/records', auth, (req, res) => { ... })
 *
 * 【安全设计】
 *   - Token 有效期设置为 7 天（在 routes/auth.js 中配置），过期后需重新登录
 *   - 使用 Bearer 认证方案，符合 OAuth 2.0 标准
 *   - 验证失败时只返回通用错误信息，不暴露具体失败原因（安全最佳实践）
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT 认证中间件函数
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - 调用下一个中间件或路由处理函数
 */
function auth(req, res, next) {
  // 从请求头中获取 Authorization 字段
  // 标准格式为 "Bearer <token>"，例如 "Bearer eyJhbGciOiJIUzI1NiIs..."
  const header = req.headers.authorization;

  // 检查 Authorization 头是否存在，且以 "Bearer " 开头
  // 如果缺失或格式不对，说明客户端未提供有效的认证信息
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    // 从 "Bearer <token>" 中提取 Token 字符串
    // 按空格分割后取第二部分（索引 1）
    const token = header.split(' ')[1];

    // 验证 Token 的签名和有效期
    // jwt.verify() 会检查：
    //   1. Token 的签名是否与 jwtSecret 匹配（防篡改）
    //   2. Token 是否已过期（检查 exp 字段）
    //   3. Token 的算法是否为预期算法（默认 HS256）
    // 验证通过则返回 payload 对象，失败则抛出异常
    const payload = jwt.verify(token, config.jwtSecret);

    // 将 Token 载荷中的用户信息注入到请求对象
    // userId: 用户数据库主键 ID，用于后续数据查询的权限隔离
    // openid: 微信用户唯一标识，某些场景可能需要使用
    req.userId = payload.userId;
    req.openid = payload.openid;

    // 认证通过，调用 next() 将控制权传递给下一个中间件或路由处理函数
    next();
  } catch (e) {
    // Token 验证失败（签名无效、已过期、格式错误等）
    // 统一返回 401 状态码，不区分具体失败原因（安全考虑）
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = auth;

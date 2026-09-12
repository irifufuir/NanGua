/**
 * ============================================================
 *  other/backgrounds.js
 *  背景资源清单
 * ------------------------------------------------------------
 *  使用方法：
 *  1. 把文件放进对应文件夹（image / video / dynamic）
 *  2. 在下面列表里加一行路径，例如 'image/123.jpg'
 *  3. 页面显示的名字会自动从文件名提取（去掉扩展名）
 *     例如 'image/123.jpg' → 显示为 "123"
 *     例如 'video/conan.mp4' → 显示为 "conan"
 *
 *  ⚠️ 关于 .dxs（Wallpaper Engine 动态壁纸）：
 *     浏览器无法直接播放 .dxs / .pkg 格式，
 *     请先用 Wallpaper Engine 导出为 mp4 / webm，
 *     放到 dynamic/ 文件夹，再写到这里。
 *
 *  ⚠️ 关于自动扫描文件夹：
 *     浏览器出于安全策略，JS 不能读取本地目录。
 *     要做到真正“自动列出”，必须配一个后端服务。
 * ============================================================
 */
window.BACKGROUND_CONFIG = {

    /* ============ 视频（含动态壁纸） ============ */
    video: [
        // 'video/文件名.mp4',
        // 'dynamic/文件名.mp4',
        'video/DJG.mp4',
        'video/啥子龙.mp4',
        'video/哥伦比娅木偶喵.mp4',
        //'dynamic/文件名.mp4'
    ],

    /* ============ 图片 ============ */
    image: [
        // 'image/ASD.jpg',
        'image/bg.jpg',
        //'image/conan.jpg',
        //'image/hutao.jpg',
        //'image/xiaogong.jpg'
    ]
};
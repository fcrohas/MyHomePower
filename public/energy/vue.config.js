module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  "devServer": {
    "disableHostCheck": true,
    "host": "192.168.2.190", 
    "port": "8080",
    "proxy": "http://192.168.2.190:3000"
  },
  chainWebpack: config => {
     const svgRule = config.module.rule('svg')
     svgRule.uses.clear()
     svgRule
          .use('vue-svg-loader')
          .loader('vue-svg-loader')
  }
}

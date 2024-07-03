module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  "devServer": {
    "disableHostCheck": true,
    "host": "localhost", 
    "port": "8080",
    "proxy": "http://localhost:3000"
  },
  chainWebpack: config => {
     const svgRule = config.module.rule('svg')
     svgRule.uses.clear()
     svgRule
          .use('vue-svg-loader')
          .loader('vue-svg-loader')
  }
}

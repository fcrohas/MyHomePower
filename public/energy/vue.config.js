module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  "devServer": {
    "disableHostCheck": true,
    "host": "192.168.2.62", 
    "port": "8080",
    "proxy": "http://192.168.2.149:3000"
  }
}

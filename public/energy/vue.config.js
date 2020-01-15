module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  "devServer": {
    "disableHostCheck": true,
    "host": "192.168.2.195", 
    "port": "8080",
    "proxy": "http://192.168.2.195:3000"
  }
}

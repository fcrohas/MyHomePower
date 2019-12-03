export const ChartOptions = {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: "Heure creuse",
      data:[],
      backgroundColor: 'rgba(0, 128, 255, 0.5)'
    },  {
      label: "Heure pleine",
      data:[],
      backgroundColor: 'rgba(0, 0, 255, 0.5)'
    }]
  },
  options: {
    scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        }
  }
}

export default ChartOptions;
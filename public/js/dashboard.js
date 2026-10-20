fetch('/api/estatus-creditos')
  .then(res => res.json())
  .then(data => {

    const labels = data.map(d => d.estatus_credito);
    const values = data.map(d => d.total);

    new Chart(document.getElementById('estatusChart'), {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values
        }]
      }
    });
  });

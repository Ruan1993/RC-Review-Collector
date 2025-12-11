fetch('http://localhost:3000/api/cron/fetch-reviews')
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);

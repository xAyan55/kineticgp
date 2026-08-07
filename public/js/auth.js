document.addEventListener('DOMContentLoaded', function () {
  const pwToggle = document.getElementById('pwToggle');
  const pwInput = document.getElementById('password');

  if (pwToggle && pwInput) {
    pwToggle.addEventListener('click', function () {
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      pwToggle.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
      
      const svg = pwToggle.querySelector('svg');
      if (svg) {
        svg.style.opacity = isPw ? '0.7' : '1';
      }
    });
  }
});

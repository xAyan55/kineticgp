/**
 * KineticGP Main Client JavaScript
 * Handles viewport animation observers and core UI interactions.
 */
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('js-loaded');

  const animatedElements = document.querySelectorAll('[data-animate]');
  
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });

    animatedElements.forEach(el => observer.observe(el));
  } else {
    animatedElements.forEach(el => el.classList.add('animated'));
  }
});

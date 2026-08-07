document.addEventListener('DOMContentLoaded', function () {
  const container = document.getElementById('reviewsCarousel');
  if (!container) return;

  const slides = container.querySelectorAll('.review-slide');
  if (slides.length === 0) return;

  let currentIndex = 0;
  const prevBtn = document.getElementById('prevReview');
  const nextBtn = document.getElementById('nextReview');

  function showSlide(index) {
    slides.forEach(function (slide, idx) {
      if (idx === index) {
        slide.classList.remove('hidden');
        slide.classList.add('block');
      } else {
        slide.classList.add('hidden');
        slide.classList.remove('block');
      }
    });
  }

  function nextSlide() {
    currentIndex = (currentIndex + 1) % slides.length;
    showSlide(currentIndex);
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + slides.length) % slides.length;
    showSlide(currentIndex);
  }

  if (nextBtn) nextBtn.addEventListener('click', nextSlide);
  if (prevBtn) prevBtn.addEventListener('click', prevSlide);

  // Auto slide every 5 seconds
  let timer = setInterval(nextSlide, 5000);

  container.addEventListener('mouseenter', function () {
    clearInterval(timer);
  });

  container.addEventListener('mouseleave', function () {
    timer = setInterval(nextSlide, 5000);
  });

  showSlide(currentIndex);
});

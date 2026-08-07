document.addEventListener('DOMContentLoaded', function () {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    const button = item.querySelector('.faq-button');
    const content = item.querySelector('.accordion-content');
    const icon = item.querySelector('.faq-icon');

    if (button && content) {
      button.addEventListener('click', function () {
        const isOpen = content.classList.contains('open');

        // Close all other accordion items
        faqItems.forEach(function (other) {
          const otherContent = other.querySelector('.accordion-content');
          const otherIcon = other.querySelector('.faq-icon');
          if (otherContent) {
            otherContent.classList.remove('open');
            otherContent.style.maxHeight = '0px';
          }
          if (otherIcon) {
            otherIcon.style.transform = 'rotate(0deg)';
          }
        });

        if (!isOpen) {
          content.classList.add('open');
          content.style.maxHeight = content.scrollHeight + 'px';
          if (icon) {
            icon.style.transform = 'rotate(180deg)';
          }
        }
      });
    }
  });
});

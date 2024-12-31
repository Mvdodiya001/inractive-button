const yesButton = document.getElementById('yes');
const noButton = document.getElementById('no');
const question = document.getElementById('question');

// Display a message when "Yes" is clicked
yesButton.addEventListener('click', () => {
    question.textContent = "Congratulations!";
});

// Move "No" button when hovered or clicked
noButton.addEventListener('mouseover', moveButton);
noButton.addEventListener('click', moveButton);

function moveButton() {
    const x = Math.random() * (window.innerWidth - noButton.offsetWidth);
    const y = Math.random() * (window.innerHeight - noButton.offsetHeight);

    noButton.style.left = `${x}px`;
    noButton.style.top = `${y}px`;
}

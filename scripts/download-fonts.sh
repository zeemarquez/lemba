#!/bin/bash
mkdir -p public/fonts/preloaded

fonts=(
  "Inter"
  "Roboto"
  "Montserrat"
  "Open Sans"
  "Lato"
  "Playfair Display"
  "Merriweather"
  "Lora"
  "JetBrains Mono"
  "Fira Code"
  "Oswald"
  "Raleway"
  "Poppins"
  "Ubuntu"
  "Nunito"
  "Quicksand"
  "Kanit"
  "Bebas Neue"
  "Bitter"
  "Work Sans"
  "Nanum Gothic"
  "PT Sans"
  "PT Serif"
  "Inconsolata"
  "Source Code Pro"
  "DM Sans"
  "Manrope"
  "Josefin Sans"
  "Cabin"
  "Arimo"
)

for name in "${fonts[@]}"; do
  filename=$(echo "$name" | tr ' ' '_').ttf
  if [ -f "public/fonts/preloaded/$filename" ]; then
    echo "Skipping $name (already exists)"
    continue
  fi

  echo "Fetching URL for $name..."
  # Replace spaces with + for URL
  query_name=$(echo "$name" | tr ' ' '+')
  # Fetch CSS and extract the first ttf URL
  url=$(curl -s "https://fonts.googleapis.com/css2?family=$query_name" | grep -o "https://fonts.gstatic.com[^\)]*.ttf" | head -n 1)
  
  if [ -n "$url" ]; then
    echo "Downloading $name from $url..."
    curl -L -o "public/fonts/preloaded/$filename" "$url"
  else
    echo "Could not find URL for $name"
  fi
done

echo "Downloads complete."

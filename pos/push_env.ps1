$envVars = @{
    VITE_CLOUDINARY_CLOUD_NAME = "dwdg61spy"
    VITE_ADMIN_USERNAME = "Admin"
    VITE_ADMIN_PASSWORD = "Password"
    VITE_CLOUDINARY_UPLOAD_PRESET = "ganewa_pos"
    VITE_FIREBASE_API_KEY = "AIzaSyCGd_uW0pJ-OnQ7Zu-t6WIWgWO2SItpSGk"
    VITE_FIREBASE_AUTH_DOMAIN = "ganewa-provision-pos.firebaseapp.com"
    VITE_FIREBASE_PROJECT_ID = "ganewa-provision-pos"
    VITE_FIREBASE_MESSAGING_SENDER_ID = "1039455743113"
    VITE_FIREBASE_APP_ID = "1:1039455743113:web:3a2d95095f791c4ab6aa58"
}

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    Write-Host "Adding $key to Vercel production..."
    $value | vercel env add $key production
}

package com.erpnlr.orderscanner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.erpnlr.orderscanner.utils.Constants
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScannerActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvStatus: TextView
    private lateinit var btnBack: ImageButton
    private lateinit var cameraExecutor: ExecutorService
    private var camera: Camera? = null
    private var isScanning = true

    companion object {
        private const val TAG = "ScannerActivity"
        private const val CAMERA_PERMISSION_REQUEST_CODE = 100
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_scanner)

        previewView = findViewById(R.id.previewView)
        tvStatus = findViewById(R.id.tvStatus)
        btnBack = findViewById(R.id.btnBack)

        btnBack.setOnClickListener {
            finish()
        }

        cameraExecutor = Executors.newSingleThreadExecutor()

        if (checkCameraPermission()) {
            startCamera()
        } else {
            requestCameraPermission()
        }
    }

    private fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.CAMERA),
            CAMERA_PERMISSION_REQUEST_CODE
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                Toast.makeText(
                    this,
                    getString(R.string.scanner_permission_denied),
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor, QRCodeAnalyzer { qrCode ->
                        onQRCodeDetected(qrCode)
                    })
                }

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(
                    this,
                    cameraSelector,
                    preview,
                    imageAnalyzer
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera binding failed", e)
            }

        }, ContextCompat.getMainExecutor(this))
    }

    private fun onQRCodeDetected(qrCode: String) {
        if (!isScanning) return
        isScanning = false

        runOnUiThread {
            tvStatus.text = "Detected: $qrCode"
            tvStatus.visibility = View.VISIBLE

            // Check if we should return result or navigate
            if (intent.getBooleanExtra("return_result", false)) {
                val resultIntent = Intent().apply {
                    putExtra(Constants.EXTRA_SCANNED_CODE, qrCode)
                }
                setResult(RESULT_OK, resultIntent)
                finish()
                return@runOnUiThread
            }

            // Check if this is a bulk QR code (JSON with type: "bulk" or "cancel")
            if (qrCode.trimStart().startsWith("{")) {
                try {
                    val gson = com.google.gson.Gson()
                    val data = gson.fromJson(qrCode, Map::class.java)
                    val type = data?.get("type") as? String
                    if (type == "bulk") {
                        // Navigate to orders list with bulk QR data
                        val intent = Intent(this, OrdersListActivity::class.java).apply {
                            putExtra("bulk_qr_data", qrCode)
                        }
                        startActivity(intent)
                        return@runOnUiThread
                    } else if (type == "quotation" || type == "outsourcing") {
                        // Navigate to quotation detail view
                        val id = (data?.get("id") as? Double)?.toInt()
                        if (id != null) {
                            val intent = Intent(this, QuotationDetailActivity::class.java).apply {
                                putExtra("QUOTATION_ID", id)
                                putExtra("QUOTATION_TYPE", type)
                            }
                            startActivity(intent)
                        }
                        return@runOnUiThread
                    } else if (type == "cancel") {
                        // Navigate to orders list to cancel PO#s
                        val intent = Intent(this, OrdersListActivity::class.java).apply {
                            putExtra("cancel_qr_data", qrCode)
                        }
                        startActivity(intent)
                        return@runOnUiThread
                    }
                } catch (e: Exception) {
                    // Not valid JSON, treat as regular QR
                }
            }

            // Regular single PO# QR code
            val intent = Intent(this, MainActivity::class.java).apply {
                putExtra(Constants.EXTRA_ORDER_SEQ, qrCode)
            }
            startActivity(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        isScanning = true
        tvStatus.visibility = View.GONE
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }

    private class QRCodeAnalyzer(
        private val onQRCodeDetected: (String) -> Unit
    ) : ImageAnalysis.Analyzer {

        private val scanner = BarcodeScanning.getClient()

        @androidx.camera.core.ExperimentalGetImage
        override fun analyze(imageProxy: ImageProxy) {
            val mediaImage = imageProxy.image
            if (mediaImage != null) {
                val image = InputImage.fromMediaImage(
                    mediaImage,
                    imageProxy.imageInfo.rotationDegrees
                )

                scanner.process(image)
                    .addOnSuccessListener { barcodes ->
                        for (barcode in barcodes) {
                            barcode.rawValue?.let { value ->
                                onQRCodeDetected(value)
                            }
                        }
                    }
                    .addOnCompleteListener {
                        imageProxy.close()
                    }
            } else {
                imageProxy.close()
            }
        }
    }
}

package com.erpnlr.orderscanner

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.erpnlr.orderscanner.api.ApiClient
import com.erpnlr.orderscanner.models.ScanRequest
import com.erpnlr.orderscanner.models.ScanResponse
import com.erpnlr.orderscanner.utils.Constants
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var tvOrderSeq: TextView
    private lateinit var tvPresentDepartment: TextView
    private lateinit var spinnerDepartment: Spinner
    private lateinit var etNotes: EditText
    private lateinit var btnSave: MaterialButton
    private lateinit var btnScanAgain: MaterialButton
    private lateinit var progressBar: ProgressBar

    private var orderSeq: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupDepartmentSpinner()

        orderSeq = intent.getStringExtra(Constants.EXTRA_ORDER_SEQ) ?: ""
        tvOrderSeq.text = orderSeq

        if (orderSeq.isEmpty()) {
            Toast.makeText(this, getString(R.string.error_invalid_qr), Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setupClickListeners()
        fetchPresentDepartment()
    }

    private fun initViews() {
        tvOrderSeq = findViewById(R.id.tvPoNumber)
        tvPresentDepartment = findViewById(R.id.tvPresentDepartment)
        spinnerDepartment = findViewById(R.id.spinnerDepartment)
        etNotes = findViewById(R.id.etNotes)
        btnSave = findViewById(R.id.btnSave)
        btnScanAgain = findViewById(R.id.btnScanAgain)
        progressBar = findViewById(R.id.progressBar)
    }

    private fun setupDepartmentSpinner() {
        val adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            Constants.DEPARTMENTS
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerDepartment.adapter = adapter
    }

    private fun setupClickListeners() {
        btnSave.setOnClickListener {
            saveScan()
        }
        btnScanAgain.setOnClickListener {
            finish()
        }
    }

    private fun fetchPresentDepartment() {
        if (!isNetworkAvailable()) {
            tvPresentDepartment.text = "Present Department: Unable to check"
            tvPresentDepartment.visibility = View.VISIBLE
            return
        }

        lifecycleScope.launch {
            try {
                val response = ApiClient.getApiService(this@MainActivity).getLastScan(orderSeq)

                if (response.isSuccessful) {
                    val body = response.body()
                    runOnUiThread {
                        if (body?.lastScan != null) {
                            tvPresentDepartment.text = "Present Department: ${body.lastScan.department}"
                            tvPresentDepartment.visibility = View.VISIBLE
                        } else {
                            tvPresentDepartment.text = "Present Department: None (Start with CS Team)"
                            tvPresentDepartment.visibility = View.VISIBLE
                        }
                    }
                } else {
                    runOnUiThread {
                        tvPresentDepartment.text = "Present Department: None (Start with CS Team)"
                        tvPresentDepartment.visibility = View.VISIBLE
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    tvPresentDepartment.text = "Present Department: Unable to check"
                    tvPresentDepartment.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun saveScan() {
        if (spinnerDepartment.selectedItemPosition == -1) {
            Toast.makeText(this, getString(R.string.error_no_department), Toast.LENGTH_SHORT).show()
            return
        }

        if (!isNetworkAvailable()) {
            Toast.makeText(this, getString(R.string.error_network), Toast.LENGTH_LONG).show()
            return
        }

        val department = spinnerDepartment.selectedItem.toString()
        val notes = etNotes.text.toString().trim().ifEmpty { null }

        val request = ScanRequest(
            orderSeq = orderSeq,
            department = department,
            notes = notes
        )

        setLoading(true)

        lifecycleScope.launch {
            try {
                val response = ApiClient.getApiService(this@MainActivity).recordScan(request)

                if (response.isSuccessful && response.body()?.success == true) {
                    runOnUiThread {
                        setLoading(false)
                        Toast.makeText(this@MainActivity, getString(R.string.success_saved), Toast.LENGTH_SHORT).show()
                        clearForm()
                        tvOrderSeq.postDelayed({ finish() }, 1500)
                    }
                } else {
                    val errorBody = if (response.isSuccessful) {
                        response.body()
                    } else {
                        try {
                            val errorJson = response.errorBody()?.string()
                            if (errorJson != null) {
                                com.google.gson.Gson().fromJson(errorJson, ScanResponse::class.java)
                            } else {
                                null
                            }
                        } catch (e: Exception) {
                            null
                        }
                    }

                    val errorMessage = when {
                        errorBody?.error != null -> {
                            val isSequenceError = errorBody.error.contains("Cannot go back") ||
                                    errorBody.error.contains("Cannot skip") ||
                                    errorBody.error.contains("repeat department") ||
                                    errorBody.error.contains("First scan must")

                            if (isSequenceError) {
                                if (errorBody.nextExpected != null) {
                                    "Wrong progress sequence\nNext expected: ${errorBody.nextExpected}"
                                } else {
                                    "Wrong progress sequence"
                                }
                            } else {
                                errorBody.error
                            }
                        }
                        else -> getString(R.string.error_server)
                    }

                    runOnUiThread {
                        setLoading(false)
                        Toast.makeText(this@MainActivity, errorMessage, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    Toast.makeText(this@MainActivity, getString(R.string.error_network), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnSave.isEnabled = !loading
        btnScanAgain.isEnabled = !loading
        spinnerDepartment.isEnabled = !loading
        etNotes.isEnabled = !loading
    }

    private fun clearForm() {
        spinnerDepartment.setSelection(0)
        etNotes.text.clear()
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
}

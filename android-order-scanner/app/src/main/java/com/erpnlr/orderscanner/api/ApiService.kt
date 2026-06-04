package com.erpnlr.orderscanner.api

import com.erpnlr.orderscanner.models.ScanRequest
import com.erpnlr.orderscanner.models.ScanResponse
import com.erpnlr.orderscanner.models.LastScanResponse
import com.erpnlr.orderscanner.models.OrderDetailResponse
import com.erpnlr.orderscanner.models.ProgressHistoryResponse
import com.erpnlr.orderscanner.models.OrdersListResponse
import com.erpnlr.orderscanner.models.BulkCancelRequest
import com.erpnlr.orderscanner.models.BulkCancelResponse
import com.erpnlr.orderscanner.models.BulkScanUpdateRequest
import com.erpnlr.orderscanner.models.BulkScanUpdateResponse
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming
import retrofit2.http.Url

interface ApiService {
    @POST("api/orders/progress/scan")
    suspend fun recordScan(@Body request: ScanRequest): Response<ScanResponse>

    @GET("api/orders/progress/{orderSeq}/last")
    suspend fun getLastScan(@Path("orderSeq") orderSeq: String): Response<LastScanResponse>

    @GET("api/orders/progress/{orderSeq}")
    suspend fun getProgressHistory(@Path("orderSeq") orderSeq: String): Response<ProgressHistoryResponse>

    @GET("api/orders/seq/{orderSeq}")
    suspend fun getOrderBySeq(@Path("orderSeq") orderSeq: String): Response<OrderDetailResponse>

    // New endpoints for order list management
    @GET("api/orders")
    suspend fun getAllOrders(): Response<OrdersListResponse>

    @POST("api/orders/bulk-cancel")
    suspend fun bulkCancelOrders(@Body request: BulkCancelRequest): Response<BulkCancelResponse>

    @POST("api/orders/bulk-scan-update")
    suspend fun bulkScanUpdate(@Body request: BulkScanUpdateRequest): Response<BulkScanUpdateResponse>

    @Streaming
    @GET
    suspend fun downloadFile(@Url url: String): Response<ResponseBody>
}

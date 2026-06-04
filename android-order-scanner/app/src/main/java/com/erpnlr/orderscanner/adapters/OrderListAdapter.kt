package com.erpnlr.orderscanner.adapters

import android.graphics.Bitmap
import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.erpnlr.orderscanner.R
import com.erpnlr.orderscanner.models.OrderListItem
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.*

class OrderListAdapter(
    private val onItemClick: (OrderListItem) -> Unit,
    private val onDeleteClick: (OrderListItem) -> Unit,
    private val onSelectionChanged: (Int) -> Unit,
    private val onEnterMultiSelect: () -> Unit,
    private val onExitMultiSelect: () -> Unit
) : RecyclerView.Adapter<OrderListAdapter.OrderViewHolder>() {

    private var orders: List<OrderListItem> = emptyList()
    private val selectedIds = mutableSetOf<Int>()
    private var isMultiSelectMode = false
    private val qrCache = mutableMapOf<String, Bitmap>()
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    inner class OrderViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val cbSelect: CheckBox = view.findViewById(R.id.cbSelect)
        val ivQrThumbnail: ImageView = view.findViewById(R.id.ivQrThumbnail)
        val tvOrderSeq: TextView = view.findViewById(R.id.tvOrderSeq)
        val tvStatus: TextView = view.findViewById(R.id.tvStatus)
        val tvCustomer: TextView = view.findViewById(R.id.tvCustomer)
        val tvProductType: TextView = view.findViewById(R.id.tvProductType)
        val tvQuantity: TextView = view.findViewById(R.id.tvQuantity)
        val tvFactory: TextView = view.findViewById(R.id.tvFactory)
        val btnDelete: ImageButton = view.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_order_list, parent, false)
        return OrderViewHolder(view)
    }

    override fun onBindViewHolder(holder: OrderViewHolder, position: Int) {
        val order = orders[position]

        // Order info
        holder.tvOrderSeq.text = order.orderSeq
        holder.tvCustomer.text = order.customerName
        holder.tvProductType.text = order.productType
        holder.tvQuantity.text = String.format("%,d", order.quantity)
        holder.tvFactory.text = order.workshopName ?: "Not assigned"

        // Status badge
        val statusColor = when (order.status) {
            "pending" -> Color.parseColor("#17a2b8")
            "in-production" -> Color.parseColor("#007bff")
            "completed" -> Color.parseColor("#28a745")
            "cancelled" -> Color.parseColor("#6c757d")
            else -> Color.parseColor("#666666")
        }
        holder.tvStatus.text = order.status
        holder.tvStatus.setBackgroundColor(statusColor)

        // Cancelled opacity
        holder.itemView.alpha = if (order.status == "cancelled") 0.5f else 1.0f

        // QR thumbnail
        setQrThumbnail(holder.ivQrThumbnail, order.orderSeq)

        // Checkbox
        holder.cbSelect.visibility = if (isMultiSelectMode) View.VISIBLE else View.GONE
        holder.cbSelect.setOnCheckedChangeListener(null)
        holder.cbSelect.isChecked = selectedIds.contains(order.id)
        holder.cbSelect.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                selectedIds.add(order.id)
            } else {
                selectedIds.remove(order.id)
            }
            onSelectionChanged(selectedIds.size)
        }

        // Click handlers
        holder.itemView.setOnClickListener {
            if (isMultiSelectMode) {
                holder.cbSelect.isChecked = !holder.cbSelect.isChecked
            } else {
                onItemClick(order)
            }
        }

        holder.itemView.setOnLongClickListener {
            if (!isMultiSelectMode) {
                isMultiSelectMode = true
                selectedIds.add(order.id)
                onEnterMultiSelect()
                notifyItemRangeChanged(0, orders.size)
            }
            true
        }

        // Delete button
        holder.btnDelete.setOnClickListener {
            onDeleteClick(order)
        }
    }

    override fun getItemCount() = orders.size

    fun setOrders(newOrders: List<OrderListItem>) {
        orders = newOrders
        selectedIds.clear()
        notifyDataSetChanged()
    }

    fun setMultiSelectMode(enabled: Boolean) {
        isMultiSelectMode = enabled
        if (!enabled) selectedIds.clear()
        notifyItemRangeChanged(0, orders.size)
    }

    fun clearSelection() {
        selectedIds.clear()
        notifyItemRangeChanged(0, orders.size)
    }

    fun getSelectedOrders(): List<OrderListItem> {
        return orders.filter { selectedIds.contains(it.id) }
    }

    private fun setQrThumbnail(imageView: ImageView, orderSeq: String) {
        // Check cache first
        qrCache[orderSeq]?.let {
            imageView.setImageBitmap(it)
            return
        }

        // Generate QR in background
        scope.launch {
            try {
                val writer = QRCodeWriter()
                val bitMatrix = writer.encode(orderSeq, BarcodeFormat.QR_CODE, 120, 120)
                val width = bitMatrix.width
                val height = bitMatrix.height
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                for (x in 0 until width) {
                    for (y in 0 until height) {
                        bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
                    }
                }
                qrCache[orderSeq] = bitmap

                withContext(Dispatchers.Main) {
                    imageView.setImageBitmap(bitmap)
                }
            } catch (e: Exception) {
                // Silently fail for QR generation
            }
        }
    }

    fun clearQrCache() {
        qrCache.clear()
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        super.onDetachedFromRecyclerView(recyclerView)
        scope.cancel()
        qrCache.clear()
    }
}